<?php
session_start();

// ===== KONFIGURASI =====
$USERNAME = 'Chindy';
$PASSWORD = 'luvyu';

// URL bot WA di Render (ganti dengan URL Render lo)
$BOT_API_URL = 'https://botwa-ig.onrender.com';
$API_KEY = 'rahasia123';
// =======================

function isLoggedIn() {
    return isset($_SESSION['logged_in']) && $_SESSION['logged_in'] === true;
}

function requireLogin() {
    if (!isLoggedIn()) {
        header('Location: index.php');
        exit;
    }
}

function callBotAPI($endpoint, $data = [], $method = 'GET') {
    global $BOT_API_URL, $API_KEY;

    $url = $BOT_API_URL . $endpoint;
    $ch = curl_init();

    $headers = [
        'Authorization: Bearer ' . $API_KEY,
        'Content-Type: application/json',
    ];

    if ($method === 'GET' && !empty($data)) {
        $url .= '?' . http_build_query($data);
        curl_setopt($ch, CURLOPT_HTTPGET, true);
    } else {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    }

    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);

    $result = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error) {
        return ['success' => false, 'error' => 'cURL Error: ' . $error];
    }

    $decoded = json_decode($result, true);
    return [
        'success' => $httpCode >= 200 && $httpCode < 300,
        'http_code' => $httpCode,
        'data' => $decoded ?: $result,
    ];
}
