<?php
require_once __DIR__ . '/config.php';

// Harden the session cookie: HTTP-only (JS can't read it), SameSite (limits CSRF),
// Secure (only sent over HTTPS — safe to leave on once your SSL is active).
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'httponly' => true,
    'samesite' => 'Lax',
    'secure' => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
]);
session_start();

// ---------- Login handling ----------
if (isset($_POST['login_password'])) {
    $_SESSION['login_attempts'] = ($_SESSION['login_attempts'] ?? 0);
    $_SESSION['locked_until'] = $_SESSION['locked_until'] ?? 0;

    if (time() < $_SESSION['locked_until']) {
        $waitMin = ceil(($_SESSION['locked_until'] - time()) / 60);
        $login_error = "Too many attempts. Try again in {$waitMin} minute(s).";
    } elseif (hash_equals(ADMIN_PASSWORD, $_POST['login_password'])) {
        $_SESSION['lazy_admin'] = true;
        $_SESSION['login_attempts'] = 0;
    } else {
        $_SESSION['login_attempts']++;
        if ($_SESSION['login_attempts'] >= 5) {
            $_SESSION['locked_until'] = time() + (10 * 60); // lock for 10 minutes
            $login_error = 'Too many attempts. Try again in 10 minutes.';
        } else {
            $login_error = 'Wrong password.';
        }
    }
}
if (isset($_GET['logout'])) {
    session_destroy();
    header('Location: admin.php');
    exit;
}
$is_logged_in = !empty($_SESSION['lazy_admin']);

$pdo = $is_logged_in ? get_db_connection() : null;

// ---------- Status update (mark contacted / closed) ----------
if ($is_logged_in && $pdo && isset($_POST['update_status'], $_POST['lead_id'])) {
    $allowed = ['new', 'contacted', 'closed'];
    $status = in_array($_POST['update_status'], $allowed, true) ? $_POST['update_status'] : 'new';
    $stmt = $pdo->prepare("UPDATE lazy_leads SET status = :status WHERE id = :id");
    $stmt->execute([':status' => $status, ':id' => (int)$_POST['lead_id']]);
    header('Location: admin.php' . (isset($_GET['q']) ? '?q=' . urlencode($_GET['q']) : ''));
    exit;
}

// ---------- CSV export ----------
if ($is_logged_in && $pdo && isset($_GET['export']) && $_GET['export'] === 'csv') {
    $rows = $pdo->query("SELECT * FROM lazy_leads ORDER BY created_at DESC")->fetchAll();
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename=lazy_leads.csv');
    $out = fopen('php://output', 'w');
    fputcsv($out, ['ID', 'Name', 'Phone', 'Matched Plan', 'Status', 'Page URL', 'IP', 'Created At']);
    foreach ($rows as $r) {
        fputcsv($out, [$r['id'], $r['name'], $r['phone'], $r['matched_plan'], $r['status'], $r['page_url'], $r['ip_address'], $r['created_at']]);
    }
    fclose($out);
    exit;
}

// ---------- Fetch leads for display ----------
$leads = [];
$counts = ['new' => 0, 'contacted' => 0, 'closed' => 0];
if ($is_logged_in && $pdo) {
    $q = trim($_GET['q'] ?? '');
    if ($q !== '') {
        $stmt = $pdo->prepare("SELECT * FROM lazy_leads WHERE name LIKE :q OR phone LIKE :q ORDER BY created_at DESC");
        $stmt->execute([':q' => '%' . $q . '%']);
    } else {
        $stmt = $pdo->query("SELECT * FROM lazy_leads ORDER BY created_at DESC");
    }
    $leads = $stmt->fetchAll();

    $countStmt = $pdo->query("SELECT status, COUNT(*) c FROM lazy_leads GROUP BY status");
    foreach ($countStmt->fetchAll() as $row) { $counts[$row['status']] = (int)$row['c']; }
}
$total = array_sum($counts);
function h($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Leads — The MindSnack</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  :root{
    --ink:#0F1B2B; --paper:#F5F3EE; --paper-dim:#EAE7DF;
    --cobalt:#2F5AFF; --cobalt-dim:#E7ECFF; --marigold:#F2A93B; --leaf:#2FA36B;
    --line: rgba(15,27,43,0.12); --ink-60: rgba(15,27,43,0.62); --ink-40: rgba(15,27,43,0.42);
  }
  *{box-sizing:border-box;}
  body{ margin:0; background:var(--paper); color:var(--ink); font-family:'Inter',system-ui,sans-serif; }
  h1,h2{ font-family:'Sora'; font-weight:800; letter-spacing:-0.02em; margin:0; }
  .mono{ font-family:'IBM Plex Mono'; letter-spacing:0.02em; }
  a{ color:inherit; }
  .wrap{ max-width:1100px; margin:0 auto; padding:32px 24px 80px; }

  /* ---- Login screen ---- */
  .login-wrap{ min-height:100vh; display:flex; align-items:center; justify-content:center; }
  .login-box{ background:#fff; border:1px solid var(--line); border-radius:18px; padding:32px; width:100%; max-width:340px; box-shadow:0 12px 32px -16px rgba(15,27,43,0.18); }
  .login-box h1{ font-size:20px; margin-bottom:6px; }
  .login-box p{ font-size:13.5px; color:var(--ink-60); margin:0 0 20px; }
  .login-box input{ width:100%; padding:12px 14px; border:1px solid var(--line); border-radius:10px; font-size:14px; font-family:'Inter'; margin-bottom:12px; }
  .login-box button{ width:100%; padding:12px; border:none; border-radius:10px; background:var(--ink); color:var(--paper); font-weight:600; font-size:14px; cursor:pointer; }
  .login-err{ color:#c0392b; font-size:13px; margin-bottom:12px; }

  /* ---- Dashboard ---- */
  .top{ display:flex; align-items:center; justify-content:space-between; margin-bottom:28px; flex-wrap:wrap; gap:12px; }
  .top h1{ font-size:24px; }
  .top .sub{ font-size:13px; color:var(--ink-40); margin-top:4px; }
  .top-actions{ display:flex; gap:10px; align-items:center; }
  .btn{ display:inline-flex; align-items:center; gap:6px; padding:9px 16px; border-radius:999px; border:1px solid var(--line); background:#fff; color:var(--ink); text-decoration:none; font-size:13.5px; font-weight:600; cursor:pointer; }
  .btn.dark{ background:var(--ink); color:var(--paper); border-color:var(--ink); }

  .stat-row{ display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:24px; }
  @media (max-width:640px){ .stat-row{ grid-template-columns:1fr 1fr; } }
  .stat{ background:#fff; border:1px solid var(--line); border-radius:14px; padding:16px 18px; }
  .stat .n{ font-family:'Sora'; font-weight:800; font-size:24px; }
  .stat .l{ font-family:'IBM Plex Mono'; font-size:10.5px; text-transform:uppercase; letter-spacing:0.05em; color:var(--ink-40); margin-top:2px; }

  .search{ margin-bottom:16px; }
  .search input{ width:100%; max-width:320px; padding:10px 14px; border:1px solid var(--line); border-radius:10px; font-size:14px; font-family:'Inter'; }

  table{ width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--line); border-radius:14px; overflow:hidden; }
  th, td{ text-align:left; padding:12px 14px; font-size:13.5px; border-bottom:1px solid var(--line); vertical-align:middle; }
  th{ font-family:'IBM Plex Mono'; font-size:10.5px; text-transform:uppercase; letter-spacing:0.05em; color:var(--ink-40); font-weight:500; background:var(--paper-dim); }
  tr:last-child td{ border-bottom:none; }
  .name{ font-weight:600; }
  .phone a{ color:var(--cobalt); text-decoration:none; }
  .badge{ display:inline-block; padding:3px 9px; border-radius:999px; font-size:11px; font-weight:600; }
  .badge.new{ background:var(--cobalt-dim); color:var(--cobalt); }
  .badge.contacted{ background:#FCEDD3; color:#8a5a10; }
  .badge.closed{ background:#DCF0E4; color:#1d7a4b; }
  select{ font-family:'Inter'; font-size:12.5px; padding:5px 8px; border-radius:8px; border:1px solid var(--line); background:#fff; }
  .empty{ text-align:center; padding:60px 20px; color:var(--ink-40); }
</style>
</head>
<body>

<?php if (!$is_logged_in): ?>

  <div class="login-wrap">
    <form class="login-box" method="post">
      <h1>Leads dashboard</h1>
      <p>The MindSnack — lazy pricing page</p>
      <?php if (!empty($login_error)): ?><div class="login-err"><?= h($login_error) ?></div><?php endif; ?>
      <input type="password" name="login_password" placeholder="Password" autofocus required>
      <button type="submit">Log in</button>
    </form>
  </div>

<?php else: ?>

  <div class="wrap">
    <?php if (ADMIN_PASSWORD === 'ChangeMe123!'): ?>
      <div style="background:#FCEDD3; border:1px solid #e8c987; color:#8a5a10; border-radius:12px; padding:12px 16px; font-size:13.5px; margin-bottom:20px;">
        ⚠️ You're still using the default password. Open <span class="mono">config.php</span> and change <span class="mono">ADMIN_PASSWORD</span> before this goes live.
      </div>
    <?php endif; ?>
    <div class="top">
      <div>
        <h1>Leads</h1>
        <div class="sub"><?= $total ?> total submitted through the lazy pricing page</div>
      </div>
      <div class="top-actions">
        <a class="btn" href="?export=csv">Export CSV</a>
        <a class="btn dark" href="?logout=1">Log out</a>
      </div>
    </div>

    <div class="stat-row">
      <div class="stat"><div class="n"><?= $total ?></div><div class="l">Total</div></div>
      <div class="stat"><div class="n"><?= $counts['new'] ?></div><div class="l">New</div></div>
      <div class="stat"><div class="n"><?= $counts['contacted'] ?></div><div class="l">Contacted</div></div>
      <div class="stat"><div class="n"><?= $counts['closed'] ?></div><div class="l">Closed</div></div>
    </div>

    <form class="search" method="get">
      <input type="text" name="q" placeholder="Search by name or phone..." value="<?= h($_GET['q'] ?? '') ?>">
    </form>

    <?php if (empty($leads)): ?>
      <div class="empty">No leads yet<?= isset($_GET['q']) ? ' matching that search' : '' ?>. Once someone submits the "Leave your number" form, they'll show up here.</div>
    <?php else: ?>
      <table>
        <thead>
          <tr><th>Date</th><th>Name</th><th>Phone</th><th>Matched plan</th><th>Status</th></tr>
        </thead>
        <tbody>
          <?php foreach ($leads as $lead): ?>
          <tr>
            <td class="mono" style="white-space:nowrap;"><?= h(date('d M, H:i', strtotime($lead['created_at']))) ?></td>
            <td class="name"><?= h($lead['name'] !== '' ? $lead['name'] : '—') ?></td>
            <td class="phone"><a href="tel:<?= h($lead['phone']) ?>"><?= h($lead['phone']) ?></a></td>
            <td><?= h($lead['matched_plan'] !== '' ? $lead['matched_plan'] : '—') ?></td>
            <td>
              <form method="post" style="display:flex; align-items:center; gap:8px;">
                <input type="hidden" name="lead_id" value="<?= (int)$lead['id'] ?>">
                <span class="badge <?= h($lead['status']) ?>"><?= h(ucfirst($lead['status'])) ?></span>
                <select name="update_status" onchange="this.form.submit()">
                  <option value="new" <?= $lead['status']==='new'?'selected':'' ?>>New</option>
                  <option value="contacted" <?= $lead['status']==='contacted'?'selected':'' ?>>Contacted</option>
                  <option value="closed" <?= $lead['status']==='closed'?'selected':'' ?>>Closed</option>
                </select>
              </form>
            </td>
          </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    <?php endif; ?>
  </div>

<?php endif; ?>

</body>
</html>
