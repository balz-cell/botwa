<?php
require_once 'config.php';
requireLogin();

$status = null;
$sendResult = null;
$logs = [];
$botStatus = null;

// Check bot status
$botStatus = callBotAPI('/');

// Handle send message
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    if ($_POST['action'] === 'send') {
        $to = trim($_POST['to'] ?? '');
        $message = trim($_POST['message'] ?? '');

        if ($to && $message) {
            $sendResult = callBotAPI('/api/send', [
                'to' => $to,
                'message' => $message,
            ], 'POST');
        } else {
            $sendResult = ['success' => false, 'error' => 'Nomor dan pesan harus diisi'];
        }
    }

    if ($_POST['action'] === 'broadcast') {
        $numbers = trim($_POST['numbers'] ?? '');
        $message = trim($_POST['message'] ?? '');

        if ($numbers && $message) {
            $toArray = array_map('trim', explode("\n", $numbers));
            $toArray = array_filter($toArray, fn($v) => !empty($v));
            $sendResult = callBotAPI('/api/broadcast', [
                'to' => $toArray,
                'message' => $message,
            ], 'POST');
        } else {
            $sendResult = ['success' => false, 'error' => 'Nomor dan pesan harus diisi'];
        }
    }
}

// Get logs
$logsResult = callBotAPI('/api/logs', ['limit' => 30], 'GET');
if ($logsResult['success'] && isset($logsResult['data']['logs'])) {
    $logs = array_reverse($logsResult['data']['logs']);
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - BotWA Panel</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <nav class="navbar">
        <div class="nav-brand">🤖 BotWA Panel</div>
        <div class="nav-right">
            <span>Halo, <?= htmlspecialchars($_SESSION['username']) ?>!</span>
            <a href="logout.php" class="btn btn-sm btn-logout">Logout</a>
        </div>
    </nav>

    <div class="container">
        <!-- Status Bot -->
        <div class="status-card">
            <h3>Status Bot</h3>
            <?php if ($botStatus && $botStatus['success']): ?>
                <div class="status-row">
                    <span class="status-label">Koneksi WA:</span>
                    <span class="status-value <?= $botStatus['data']['wa_connected'] ? 'green' : 'red' ?>">
                        <?= $botStatus['data']['wa_connected'] ? '✅ Terhubung' : '❌ Tidak Terhubung' ?>
                    </span>
                </div>
                <div class="status-row">
                    <span class="status-label">Server:</span>
                    <span class="status-value"><?= htmlspecialchars($botStatus['data']['status'] ?? '-') ?></span>
                </div>
            <?php else: ?>
                <div class="status-row">
                    <span class="status-value red">❌ Bot tidak merespon. Pastikan bot aktif di Render.</span>
                </div>
            <?php endif; ?>
        </div>

        <!-- Kirim Pesan -->
        <div class="card">
            <h3>📩 Kirim Pesan</h3>
            <form method="POST">
                <input type="hidden" name="action" value="send">
                <div class="form-group">
                    <label for="to">Nomor Tujuan</label>
                    <input type="text" id="to" name="to" placeholder="6281234567890" required>
                    <small>Format: 62xxx tanpa @s.whatsapp.net</small>
                </div>
                <div class="form-group">
                    <label for="message">Pesan</label>
                    <textarea id="message" name="message" rows="3" required></textarea>
                </div>
                <button type="submit" class="btn">Kirim Pesan</button>
            </form>

            <?php if ($sendResult && isset($_POST['action']) && $_POST['action'] === 'send'): ?>
                <div class="alert <?= $sendResult['success'] ? 'alert-success' : 'alert-error' ?>">
                    <?= $sendResult['success'] ? '✅ Pesan berhasil dikirim!' : '❌ Gagal: ' . htmlspecialchars($sendResult['error'] ?? ($sendResult['data']['error'] ?? 'Unknown error')) ?>
                </div>
            <?php endif; ?>
        </div>

        <!-- Broadcast -->
        <div class="card">
            <h3>📢 Broadcast</h3>
            <form method="POST">
                <input type="hidden" name="action" value="broadcast">
                <div class="form-group">
                    <label for="numbers">Nomor Tujuan (pisahkan dengan enter)</label>
                    <textarea id="numbers" name="numbers" rows="4" placeholder="6281234567890&#10;6289876543210" required></textarea>
                </div>
                <div class="form-group">
                    <label for="bcmessage">Pesan</label>
                    <textarea id="bcmessage" name="message" rows="3" required></textarea>
                </div>
                <button type="submit" class="btn btn-danger">Kirim Broadcast</button>
            </form>

            <?php if ($sendResult && isset($_POST['action']) && $_POST['action'] === 'broadcast'): ?>
                <div class="alert <?= $sendResult['success'] ? 'alert-success' : 'alert-error' ?>">
                    <?php if ($sendResult['success'] && isset($sendResult['data']['results'])): ?>
                        ✅ Broadcast selesai:<br>
                        <?php foreach ($sendResult['data']['results'] as $r): ?>
                            - <?= htmlspecialchars($r['to']) ?>: <?= $r['status'] ?><br>
                        <?php endforeach; ?>
                    <?php else: ?>
                        ❌ Gagal: <?= htmlspecialchars($sendResult['error'] ?? ($sendResult['data']['error'] ?? 'Unknown error')) ?>
                    <?php endif; ?>
                </div>
            <?php endif; ?>
        </div>

        <!-- Log Pengiriman -->
        <div class="card">
            <h3>📋 Log Pengiriman (30 terakhir)</h3>
            <?php if (empty($logs)): ?>
                <p class="muted">Belum ada log pengiriman.</p>
            <?php else: ?>
                <table class="table">
                    <thead>
                        <tr>
                            <th>Waktu</th>
                            <th>Tujuan</th>
                            <th>Pesan</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($logs as $log): ?>
                            <tr>
                                <td><?= htmlspecialchars(substr($log['time'] ?? '', 0, 19)) ?></td>
                                <td><?= htmlspecialchars($log['to'] ?? '-') ?></td>
                                <td><?= htmlspecialchars(substr($log['message'] ?? '', 0, 50)) ?></td>
                                <td>
                                    <span class="badge <?= ($log['status'] ?? '') === 'sent' ? 'badge-success' : 'badge-pending' ?>">
                                        <?= htmlspecialchars($log['status'] ?? '-') ?>
                                    </span>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endif; ?>
        </div>
    </div>
</body>
</html>
