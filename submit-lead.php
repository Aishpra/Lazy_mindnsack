<?php
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

// ---------- Spam protection ----------
// 1. Honeypot: a field named "website" that's hidden from real users via CSS.
//    Bots that auto-fill every field will trip this; humans never see it.
if (trim($_POST['website'] ?? '') !== '') {
    // Pretend success so the bot doesn't learn anything, but don't save.
    echo json_encode(['ok' => true]);
    exit;
}

// 2. Time-trap: reject submissions faster than a human could realistically fill the form.
$formLoadedAt = (int)($_POST['form_ts'] ?? 0);
if ($formLoadedAt > 0 && (time() - $formLoadedAt) < 2) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Please try again.']);
    exit;
}

$name  = trim($_POST['name'] ?? '');
$phone = trim($_POST['phone'] ?? '');
$plan  = trim($_POST['matched_plan'] ?? '');
$page  = trim($_POST['page_url'] ?? '');

// Basic validation — phone is the only required field
if ($phone === '' || strlen($phone) < 6) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Please enter a valid phone number.']);
    exit;
}
// Keep it to digits, spaces, +, -, () — reject anything that looks like injected junk
if (!preg_match('/^[0-9+\-\s()]{6,30}$/', $phone)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Please enter a valid phone number.']);
    exit;
}

// Trim to sane lengths
$name  = mb_substr($name, 0, 120);
$phone = mb_substr($phone, 0, 60);
$plan  = mb_substr($plan, 0, 60);
$page  = mb_substr($page, 0, 255);
$ip    = $_SERVER['REMOTE_ADDR'] ?? '';

$pdo = get_db_connection();
if (!$pdo) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Server error, please try WhatsApp instead.']);
    exit;
}

// 3. Rate limit: same phone number or same IP can't submit twice within 60 seconds
try {
    $check = $pdo->prepare(
        "SELECT COUNT(*) FROM lazy_leads
         WHERE (phone = :phone OR ip_address = :ip)
         AND created_at > (NOW() - INTERVAL 60 SECOND)"
    );
    $check->execute([':phone' => $phone, ':ip' => $ip]);
    if ((int)$check->fetchColumn() > 0) {
        // Treat as a friendly duplicate, not an error — they probably double-clicked
        echo json_encode(['ok' => true]);
        exit;
    }
} catch (PDOException $e) {
    error_log('Rate limit check failed: ' . $e->getMessage());
    // Fail open — don't block a real lead over a broken check
}

try {
    $stmt = $pdo->prepare(
        "INSERT INTO lazy_leads (name, phone, matched_plan, page_url, ip_address)
         VALUES (:name, :phone, :plan, :page, :ip)"
    );
    $stmt->execute([
        ':name'  => $name,
        ':phone' => $phone,
        ':plan'  => $plan,
        ':page'  => $page,
        ':ip'    => $ip,
    ]);

    // Fire-and-forget email notification (won't block the response if mail() is slow/misconfigured)
    $subject = '[' . SITE_LABEL . '] New lead: ' . ($name !== '' ? $name : $phone);
    $body = "New lead from the lazy pricing page:\n\n"
          . "Name: " . ($name !== '' ? $name : '(not given)') . "\n"
          . "Phone: $phone\n"
          . "Matched plan: " . ($plan !== '' ? $plan : '(none selected)') . "\n"
          . "Page: $page\n"
          . "IP: $ip\n"
          . "Time: " . date('Y-m-d H:i:s') . "\n";
    $headers = 'From: no-reply@themindsnack.com' . "\r\n" . 'Reply-To: no-reply@themindsnack.com';
    @mail(NOTIFY_EMAIL, $subject, $body, $headers);

    echo json_encode(['ok' => true]);
} catch (PDOException $e) {
    error_log('Insert failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not save your details, please try WhatsApp instead.']);
}
