<?php
// ============================================================
// DATABASE CONFIG — fill these in with your cPanel MySQL details
// (You'll get these values when you create the database — see
// SETUP-STEPS.md, Step 3)
// ============================================================

define('DB_HOST', 'localhost');              // almost always 'localhost' on cPanel
define('DB_NAME', 'theminds_lazyleads');       // e.g. cpanelusername_lazyleads
define('DB_USER', 'theminds_lazyuser');        // e.g. cpanelusername_lazyuser
define('DB_PASS', 'uceMNI~vd0{#~?y1');

// Where lead notification emails get sent
define('NOTIFY_EMAIL', 'info@themindsnack.com');

// Password to log into admin.php and view/manage leads.
// CHANGE THIS before uploading — anyone who knows it can see your leads.
define('ADMIN_PASSWORD', 'Snack-Lazy-7x!Qm');

// Optional: used only in the email subject line, cosmetic
define('SITE_LABEL', 'Lazy Pricing Page');

function get_db_connection() {
    try {
        $pdo = new PDO(
            "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
            DB_USER,
            DB_PASS,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]
        );
        return $pdo;
    } catch (PDOException $e) {
        // Don't leak DB details to the browser
        error_log('DB connection failed: ' . $e->getMessage());
        return null;
    }
}
