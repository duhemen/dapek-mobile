import React, { useRef } from 'react';
import { Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';

export default function WebViewScreen({ url }) {
  const webViewRef = useRef(null);

  const getLocation = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { lat: '0', lng: '0' };
    
    try {
      let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return {
        lat: location.coords.latitude.toFixed(6),
        lng: location.coords.longitude.toFixed(6)
      };
    } catch (error) {
      return { lat: '0', lng: '0' };
    }
  };

  const processAndSendImage = async (uri) => {
    try {
      // Alert 1: Memastikan gambar diterima dari ImagePicker
      Alert.alert("Info", "Gambar berhasil diambil, memproses...");
      
      const now = new Date();
      const timeStr = now.toLocaleString('id-ID');
      const loc = await getLocation();
      
      const base64Img = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const imageDataUrl = `data:image/jpeg;base64,${base64Img}`;

      // Menyuntikkan script ke WebView
      const script = `
        if (typeof window.receiveImageFromNativeAndWatermark === 'function') {
            window.receiveImageFromNativeAndWatermark(
              "${imageDataUrl}", 
              "${timeStr}", 
              "${loc.lat}, ${loc.lng}"
            );
        } else {
            alert("Fungsi di web belum siap!");
        }
        true;
      `;
      webViewRef.current.injectJavaScript(script);

    } catch (error) {
      Alert.alert("Error", "Gagal memproses gambar: " + error.message);
    }
  };

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert("Error", 'Izin kamera diperlukan!');
    
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5, // Kecilkan kualitas agar tidak terlalu berat
    });
    
    if (!result.canceled) {
      processAndSendImage(result.assets[0].uri);
    }
  };

  const openGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert("Error", 'Izin galeri diperlukan!');
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
    });
    
    if (!result.canceled) {
      processAndSendImage(result.assets[0].uri);
    }
  };

  const onMessage = (event) => {
    const message = event.nativeEvent.data;
    if (message === 'OPEN_CAMERA') openCamera();
    else if (message === 'OPEN_GALLERY') openGallery();
  };

  // SCRIPT INJECTED JAVASCRIPT
  const injectedJavaScript = `
    // Sembunyikan input asli
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(input => input.style.display = 'none');

    // Buat tombol
    const btnContainer = document.createElement('div');
    btnContainer.innerHTML = \`
      <button onclick="window.ReactNativeWebView.postMessage('OPEN_CAMERA')" style="margin:5px; padding:10px; background:#16a34a; color:white; border:none; border-radius:4px; font-weight:bold; width:100%;">📷 Kamera HP</button>
      <button onclick="window.ReactNativeWebView.postMessage('OPEN_GALLERY')" style="margin:5px; padding:10px; background:#2563eb; color:white; border:none; border-radius:4px; font-weight:bold; width:100%;">🖼️ Galeri HP</button>
    \`;
    
    if (fileInputs.length > 0) {
      fileInputs[0].parentNode.insertBefore(btnContainer, fileInputs[0]);
    }

    // FUNGSI PENERIMA GAMBAR (DIPERBAIKI)
    window.receiveImageFromNativeAndWatermark = (base64Data, timeStr, locStr) => {
      // Alert 2: Memastikan WebView menerima data dari Aplikasi
      alert("Data diterima web, memproses watermark...");
      
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        ctx.drawImage(img, 0, 0);

        ctx.font = 'bold 30px Arial';
        ctx.fillStyle = 'white';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 5;
        const padding = 30;
        
        ctx.fillText('📅 ' + timeStr, padding, canvas.height - 80);
        ctx.fillText('📍 ' + locStr, padding, canvas.height - 30);

        const watermarkedBase64 = canvas.toDataURL('image/jpeg', 0.8);

        fetch(watermarkedBase64)
          .then(res => res.blob())
          .then(blob => {
            const file = new File([blob], 'kamera-' + Date.now() + '.jpg', { type: 'image/jpeg' });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            
            // Cari SEMUA input file, pilih yang menerima gambar
            let fileInput = null;
            document.querySelectorAll('input[type="file"]').forEach(input => {
                if (input.accept.includes('image') || input.accept === '*/*') {
                    fileInput = input;
                }
            });

            if (fileInput) {
              fileInput.files = dataTransfer.files;
              fileInput.dispatchEvent(new Event('change', { bubbles: true }));
              
              const display = document.getElementById('file-name-display');
              if (display) display.innerText = '📸 ' + file.name + ' (Watermarked)';
              
              // Alert 3: Memastikan file masuk ke dalam form
              alert("File siap disimpan! Silakan klik Simpan Pekerjaan.");
            } else {
              alert("Error: Input file tidak ditemukan di form web.");
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