// ==========================================
// КОНФИГУРАЦИЯ FIREBASE
// ==========================================
const FIREBASE_URL = "https://bank-keys-default-rtdb.firebaseio.com";
const KEYS_PATH    = "/keys";
const IPS_PATH     = "/ip_locks";

const KEY_DURATION = 24 * 60 * 60; // 24 часа в секундах

// ==========================================
// ЭЛЕМЕНТЫ DOM
// ==========================================
const states = {
    loading:  document.getElementById("state-loading"),
    ready:    document.getElementById("state-ready"),
    success:  document.getElementById("state-success"),
    existing: document.getElementById("state-existing"),
    error:    document.getElementById("state-error"),
};

function showState(name) {
    Object.values(states).forEach(s => s.classList.add("hidden"));
    states[name].classList.remove("hidden");
}

// ==========================================
// ЧАСТИЦЫ НА ФОНЕ
// ==========================================
(function createParticles() {
    const container = document.getElementById("particles");
    if (!container) return;
    const count = 20;
    for (let i = 0; i < count; i++) {
        const p = document.createElement("div");
        p.className = "particle";
        p.style.left = Math.random() * 100 + "%";
        p.style.animationDuration = (8 + Math.random() * 12) + "s";
        p.style.animationDelay = (Math.random() * 10) + "s";
        p.style.opacity = 0.2 + Math.random() * 0.4;
        p.style.width = p.style.height = (1 + Math.random() * 2) + "px";
        // Разные цвета частиц
        if (Math.random() > 0.5) {
            p.style.background = "rgba(220, 20, 60, 0.4)";
        }
        container.appendChild(p);
    }
})();

// ==========================================
// УТИЛИТЫ
// ==========================================
function generateKey() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let parts = [];
    for (let i = 0; i < 3; i++) {
        let part = "";
        for (let j = 0; j < 4; j++) {
            part += chars[Math.floor(Math.random() * chars.length)];
        }
        parts.push(part);
    }
    return "VOID-" + parts.join("-");
}

async function hashIP(ip) {
    const data = new TextEncoder().encode(ip + "void_salt_2024");
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 24);
}

async function getIP() {
    const res = await fetch("https://api.ipify.org?format=json");
    const data = await res.json();
    return data.ip;
}

function formatTimeLeft(seconds) {
    if (seconds <= 0) return "Истёк";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}ч ${m}м ${s}с`;
}

function formatDate(timestamp) {
    const d = new Date(timestamp * 1000);
    return d.toLocaleString("ru-RU", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
}

// ==========================================
// FIREBASE ОПЕРАЦИИ
// ==========================================
async function firebaseGet(path) {
    const res = await fetch(`${FIREBASE_URL}${path}.json`);
    if (!res.ok) throw new Error("Firebase error");
    return await res.json();
}

async function firebasePut(path, data) {
    const res = await fetch(`${FIREBASE_URL}${path}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Firebase write error");
    return await res.json();
}

// ==========================================
// ОСНОВНАЯ ЛОГИКА
// ==========================================
let currentIPHash = null;

async function checkExistingKey() {
    showState("loading");

    try {
        const ip = await getIP();
        currentIPHash = await hashIP(ip);

        const ipLock = await firebaseGet(`${IPS_PATH}/${currentIPHash}`);

        if (ipLock && ipLock.key && ipLock.expires_at) {
            const now = Math.floor(Date.now() / 1000);

            if (now < ipLock.expires_at) {
                showExistingKey(ipLock.key, ipLock.expires_at);
                return;
            }
        }

        showState("ready");
    } catch (err) {
        console.error(err);
        showError("Не удалось проверить устройство. Попробуйте позже.");
    }
}

function showExistingKey(key, expiresAt) {
    document.getElementById("existing-key-display").textContent = key;

    const updateTime = () => {
        const now = Math.floor(Date.now() / 1000);
        const left = expiresAt - now;
        if (left <= 0) {
            checkExistingKey();
            return;
        }
        document.getElementById("time-left").textContent = formatTimeLeft(left);
    };
    updateTime();
    setInterval(updateTime, 1000);

    showState("existing");
}

async function generateNewKey() {
    const btn = document.getElementById("generate-btn");
    btn.disabled = true;
    btn.querySelector(".btn-text").textContent = "ГЕНЕРАЦИЯ...";

    try {
        const now      = Math.floor(Date.now() / 1000);
        const expires  = now + KEY_DURATION;
        const newKey   = generateKey();

        const keyData = {
            owner:        "Web User",
            plan:         "Trial 24h",
            active:       true,
            created_at:   now,
            expires_at:   expires,
            max_devices:  1,
            total_uses:   0,
            devices:      [],
            ip_hash:      currentIPHash,
        };

        await firebasePut(`${KEYS_PATH}/${newKey}`, keyData);

        await firebasePut(`${IPS_PATH}/${currentIPHash}`, {
            key:        newKey,
            created_at: now,
            expires_at: expires,
        });

        document.getElementById("key-display").textContent = newKey;
        document.getElementById("expires-display").textContent = formatDate(expires);
        showState("success");
    } catch (err) {
        console.error(err);
        showError("Не удалось сгенерировать ключ. Попробуйте позже.");
    }
}

function showError(text) {
    document.getElementById("error-text").textContent = text;
    showState("error");
}

// ==========================================
// КОПИРОВАНИЕ
// ==========================================
function copyKey(keyElement, btnElement) {
    const key = keyElement.textContent;
    navigator.clipboard.writeText(key).then(() => {
        // Меняем иконку на галочку
        btnElement.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
        btnElement.classList.add("copied");
        setTimeout(() => {
            btnElement.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" stroke="currentColor" stroke-width="1.5"/>
            </svg>`;
            btnElement.classList.remove("copied");
        }, 1500);
    });
}

// ==========================================
// ОБРАБОТЧИКИ СОБЫТИЙ
// ==========================================
document.getElementById("generate-btn").addEventListener("click", generateNewKey);
document.getElementById("retry-btn").addEventListener("click", checkExistingKey);

document.getElementById("copy-btn").addEventListener("click", (e) => {
    copyKey(document.getElementById("key-display"), e.currentTarget);
});

document.getElementById("copy-existing-btn").addEventListener("click", (e) => {
    copyKey(document.getElementById("existing-key-display"), e.currentTarget);
});

// ==========================================
// ЗАПУСК
// ==========================================
checkExistingKey();
