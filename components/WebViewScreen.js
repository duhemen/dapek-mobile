import React, { useRef, useState } from 'react';
import { WebView } from 'react-native-webview';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

export default function WebViewScreen({ url }) {
  const webViewRef = useRef(null);

  // Fungsi untuk mendapatkan lokasi
  const getLocation = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { lat: 'Tidak diketahui', lng: 'Tidak diketahui' };
    
    try {
      let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return {
        lat: location.coords.latitude.toFixed(6),
        lng: location.coords.longitude.toFixed(6)
      };
    } catch (error) {
      return { lat: 'Gagal', lng: 'Gagal' };
    }
  };

  // Fungsi untuk memproses dan menggambar watermark
  const processAndSendImage = async (uri) => {
    try {
      // 1. Ambil Waktu dan Lokasi
      const now = new Date();
      const timeStr = now.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
      const loc = await getLocation();

      // 2. Baca gambar ke base64 (untuk membuat SVG text) -> Ini trik menggunakan image-manipulator
      // Karena expo-image-manipulator tidak bisa menggambar teks langsung, kita gunakan trik "overlay" transparan
      // Namun, cara paling mudah dan stabil di React Native tanpa library native tambahan adalah menggunakan 
      // WebView untuk menggambar watermark, ATAU menggunakan library seperti 'react-native-view-shot'.
      
      // KARENA KITA INGIN PRAKTIS, KITA GUNAKAN TRIK MENGGAMBAR WATERMARK DI HTML TERSEMBUNYI DI WEBVIEW
      // (Lihat update di app.js di bawah)
      
      // Untuk saat ini, kita kirim gambar beserta data GPS dan Waktu ke WebView
      const base64Img = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const mimeType = 'image/jpeg';
      const imageDataUrl = `data:${mimeType};base64,${base64Img}`;

      const script = `
        window.receiveImageFromNativeAndWatermark(
          "${imageDataUrl}", 
          "${timeStr}", 
          "${loc.lat}, ${loc.lng}"
        );
        true;
      `;
      webViewRef.current.injectJavaScript(script);

    } catch (error) {
      alert('Gagal memproses gambar: ' + error.message);
    }
  };

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return alert('Izin kamera diperlukan!');
    
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7, // Kualitas gambar
    });
    
    if (!result.canceled) {
      processAndSendImage(result.assets[0].uri);
    }
  };

  const openGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return alert('Izin galeri diperlukan!');
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    
    if (!result.canceled) {
      // Galeri mungkin tidak butuh lokasi, tapi kita tetap berikan watermark waktu.
      processAndSendImage(result.assets[0].uri);
    }
  };

  const onMessage = (event) => {
    const message = event.nativeEvent.data;
    if (message === 'OPEN_CAMERA') openCamera();
    else if (message === 'OPEN_GALLERY') openGallery();
  };

  const injectedJavaScript = `
    // Sembunyikan input asli
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(input => input.style.display = 'none');

    // Buat tombol
    const btnContainer = document.createElement('div');
    btnContainer.innerHTML = \`
      <button onclick="window.ReactNativeWebView.postMessage('OPEN_CAMERA')" style="margin:5px; padding:8px; background:#0f172a; color:white; border:1px solid #334155; border-radius:4px;">📷 Kamera HP</button>
      <button onclick="window.ReactNativeWebView.postMessage('OPEN_GALLERY')" style="margin:5px; padding:8px; background:#0f172a; color:white; border:1px solid #334155; border-radius:4px;">🖼️ Galeri HP</button>
    \`;
    
    if (fileInputs.length > 0) {
      fileInputs[0].parentNode.insertBefore(btnContainer, fileInputs[0]);
    }

        // Fungsi menerima gambar dan MENGGAMBAR WATERMARK menggunakan Canvas HTML
    window.receiveImageFromNativeAndWatermark = (base64Data, timeStr, locStr) => {
      // TAMBAHKAN ALERT INI UNTUK MEMASTIKAN DATA MASUK
      alert("Data gambar dari HP diterima! Sedang memproses...");
      
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        // Gambar foto asli
        ctx.drawImage(img, 0, 0);

        // Gambar Watermark
        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = 'white';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;
        const padding = 20;
        
        ctx.fillText('📅 ' + timeStr, padding, canvas.height - 60);
        ctx.fillText('📍 ' + locStr, padding, canvas.height - 25);

        // Konversi kembali ke base64
        const watermarkedBase64 = canvas.toDataURL('image/jpeg', 0.85);

        // Masukkan ke Input File
        fetch(watermarkedBase64)
          .then(res => res.blob())
          .then(blob => {
            const file = new File([blob], 'kamera-' + Date.now() + '.jpg', { type: 'image/jpeg' });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            
            // Cari SEMUA input file (karena mungkin ada beberapa)
            const fileInputs = document.querySelectorAll('input[type="file"]');
            let fileInput = null;
            fileInputs.forEach(input => {
                // Pilih input yang menerima gambar
                if (input.accept.includes('image') || input.accept === '*/*') {
                    fileInput = input;
                }
            });

            if (fileInput) {
              fileInput.files = dataTransfer.files;
              fileInput.dispatchEvent(new Event('change', { bubbles: true }));
              
              // Update tulisan nama file di web
              const display = document.getElementById('file-name-display');
              if (display) display.innerText = '📸 ' + file.name + ' (Watermarked)';
              
              alert("File berhasil dimasukkan ke form! Silakan klik Simpan.");
            } else {
              alert("Error: Input file tidak ditemukan di halaman web.");
            }
          });
      };
      img.src = base64Data;
    };
    true;
  `;

  return (
    <WebView
      ref={webViewRef}
      source={{ uri: url }}
      onMessage={onMessage}
      injectedJavaScript={injectedJavaScript}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      allowFileAccess={true}
      allowFileAccessFromFileURLs={true}
      allowUniversalAccessFromFileURLs={true}
    />
  );
}