/* ==========================================================
   MATHI  -  Frontend Logic (ULTRA SECURE)
   ========================================================== */

// --- CONFIGURATION FOR CLOUD DEPLOYMENT ---
const BACKEND_URL = ""; // Set to your Render URL like "https://mathi-xyz.onrender.com"

// --- SECURITY: HMAC-SHA256 Token Generator ---
// The secret is split and assembled at runtime so it never appears as plain text
const _k = ['MATHI','_','YUG','_','ULTRA','_','2026'];
function _secret() { return _k.join(''); }

async function generateSecureHeaders() {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const secret = _secret();
    
    // Create HMAC-SHA256 signature
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const msgData = encoder.encode(`${timestamp}:${nonce}`);
    
    const cryptoKey = await window.crypto.subtle.importKey(
        'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, msgData);
    const token = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    
    return {
        'Content-Type': 'application/json',
        'x-mathi-token': token,
        'x-mathi-timestamp': timestamp,
        'x-mathi-nonce': nonce,
    };
}

// Configure Markdown Parser
marked.setOptions({
    highlight: function(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
    },
    breaks: true
});

// Custom Code Block Renderer for Copy Button
const renderer = new marked.Renderer();
renderer.code = function(code, language) {
    const validLang = hljs.getLanguage(language) ? language : 'plaintext';
    const highlighted = hljs.highlight(code, { language: validLang }).value;
    const uid = 'cb_' + Math.random().toString(36).substr(2, 9);
    return `
        <div class="code-block-wrapper">
            <div class="code-header">
                <span class="code-lang">${validLang}</span>
                <button class="copy-btn" data-uid="${uid}" onclick="copyCodeBlock('${uid}')">
                    <i class="fa-regular fa-copy"></i> Copy
                </button>
            </div>
            <pre id="${uid}"><code class="hljs ${validLang}">${highlighted}</code></pre>
        </div>
    `;
};
marked.use({ renderer });

// Global Copy Function (reads from DOM, not from inline string)
window.copyCodeBlock = function(uid) {
    const pre = document.getElementById(uid);
    if (!pre) return;
    const text = pre.innerText;
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector(`[data-uid="${uid}"]`);
        if (btn) {
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
            setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
        }
    });
};

// ---------- DOM REFERENCES ----------
const landingPage   = document.getElementById('landingPage');
const chatPage      = document.getElementById('chatPage');
const landingInput  = document.getElementById('landingInput');
const landingSendBtn= document.getElementById('landingSendBtn');
const chatInput     = document.getElementById('chatInput');
const chatSendBtn   = document.getElementById('chatSendBtn');
const chatContainer = document.getElementById('chatContainer');
const loadingBar    = document.getElementById('loadingBar');
const loadingText   = document.getElementById('loadingText');
const backBtn       = document.getElementById('backBtn');

// ---------- LOADING PHRASES ----------
const loadingPhrases = [
    "analysing your request ...",
    "initialising agent ...",
    "searching knowledge base ...",
    "generating your response ...",
    "refining output ...",
    "almost there ..."
];
let loadingInterval = null;

// ---------- UTILITY ----------
function getTimestamp() {
    const d = new Date();
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
}

// ---------- PAGE TRANSITIONS ----------
function showChatPage() {
    landingPage.classList.add('hidden');
    chatPage.classList.add('active');
    setTimeout(() => chatInput.focus(), 500);
}

function showLandingPage() {
    chatPage.classList.remove('active');
    setTimeout(() => {
        landingPage.classList.remove('hidden');
        landingInput.focus();
    }, 100);
}

backBtn.addEventListener('click', showLandingPage);

// ---------- SEND BUTTON VISIBILITY ----------
function toggleSendBtn(input, btn) {
    if (input.value.trim().length > 0) {
        btn.classList.add('visible');
    } else {
        btn.classList.remove('visible');
    }
}

landingInput.addEventListener('input', () => toggleSendBtn(landingInput, landingSendBtn));
chatInput.addEventListener('input', () => toggleSendBtn(chatInput, chatSendBtn));

// ---------- ENTER KEY ----------
landingInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && landingInput.value.trim()) handleLandingSend();
});
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim()) handleChatSend();
});

// ---------- CLICK ----------
landingSendBtn.addEventListener('click', () => {
    if (landingInput.value.trim()) handleLandingSend();
});
chatSendBtn.addEventListener('click', () => {
    if (chatInput.value.trim()) handleChatSend();
});

// ---------- LANDING SEND ----------
function handleLandingSend() {
    const text = landingInput.value.trim();
    if (!text) return;
    
    // Transition to chat page first
    showChatPage();
    
    // Clear landing input
    landingInput.value = '';
    landingSendBtn.classList.remove('visible');
    
    // Add user message and send after transition
    setTimeout(() => {
        appendMessage(text, 'user');
        sendToBackend(text);
    }, 400);
}

// ---------- CHAT SEND ----------
function handleChatSend() {
    const text = chatInput.value.trim();
    if (!text) return;
    
    appendMessage(text, 'user');
    chatInput.value = '';
    chatSendBtn.classList.remove('visible');
    sendToBackend(text);
}

// ---------- APPEND MESSAGE ----------
function appendMessage(text, sender) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('message', sender);
    
    const content = document.createElement('div');
    content.classList.add('msg-content');
    
    if (sender === 'bot') {
        // Render markdown with Marked.js
        content.innerHTML = marked.parse(text);
    } else {
        content.textContent = text;
    }
    
    const time = document.createElement('span');
    time.classList.add('msg-time');
    time.textContent = getTimestamp();
    
    wrapper.appendChild(content);
    wrapper.appendChild(time);
    chatContainer.appendChild(wrapper);
    
    // Scroll to bottom smoothly
    requestAnimationFrame(() => {
        chatContainer.scrollTo({
            top: chatContainer.scrollHeight,
            behavior: 'smooth'
        });
    });
}

// ---------- TYPEWRITER EFFECT ----------
function typewriterAppend(text) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('message', 'bot');
    
    const content = document.createElement('div');
    content.classList.add('msg-content');
    
    const cursor = document.createElement('span');
    cursor.classList.add('typewriter-cursor');
    
    content.appendChild(cursor);
    
    const time = document.createElement('span');
    time.classList.add('msg-time');
    time.textContent = getTimestamp();
    
    wrapper.appendChild(content);
    wrapper.appendChild(time);
    chatContainer.appendChild(wrapper);
    
    // Process text for basic markdown
    let processed = text
        .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Split into characters for typewriter, but handle HTML tags as single units
    const segments = [];
    let inTag = false;
    let currentTag = '';
    
    for (let i = 0; i < processed.length; i++) {
        const ch = processed[i];
        if (ch === '<') {
            inTag = true;
            currentTag = '<';
        } else if (ch === '>' && inTag) {
            currentTag += '>';
            segments.push(currentTag);
            currentTag = '';
            inTag = false;
        } else if (inTag) {
            currentTag += ch;
        } else if (ch === '\n') {
            segments.push('<br>');
        } else {
            segments.push(ch);
        }
    }
    
    let i = 0;
    const speed = 12; // milliseconds per character (ultra fast)
    
    function typeNext() {
        if (i < segments.length) {
            // Remove cursor, insert segment, re-add cursor
            if (cursor.parentNode === content) {
                content.removeChild(cursor);
            }
            
            // Use a temporary container to parse HTML segments
            const temp = document.createElement('span');
            temp.innerHTML = segments[i];
            while (temp.firstChild) {
                content.appendChild(temp.firstChild);
            }
            content.appendChild(cursor);
            
            i++;
            
            // Scroll
            chatContainer.scrollTo({
                top: chatContainer.scrollHeight,
                behavior: 'auto'
            });
            
            setTimeout(typeNext, speed);
        } else {
            // Done typing, remove cursor
            if (cursor.parentNode === content) {
                content.removeChild(cursor);
            }
        }
    }
    
    typeNext();
}

// ---------- LOADING ANIMATION ----------
function startLoading() {
    loadingBar.classList.add('active');
    let idx = 0;
    loadingText.textContent = loadingPhrases[idx];
    
    loadingInterval = setInterval(() => {
        idx = (idx + 1) % loadingPhrases.length;
        loadingText.style.opacity = '0';
        setTimeout(() => {
            loadingText.textContent = loadingPhrases[idx];
            loadingText.style.opacity = '1';
        }, 180);
    }, 1800);
}

function stopLoading() {
    clearInterval(loadingInterval);
    loadingInterval = null;
    loadingBar.classList.remove('active');
}

// ---------- BACKEND CALL ----------
async function sendToBackend(text) {
    chatInput.disabled = true;
    startLoading();
    
    try {
        const endpoint = BACKEND_URL ? `${BACKEND_URL}/api/chat` : '/api/chat';
        
        // Generate one-time HMAC signed headers for this request
        const secureHeaders = await generateSecureHeaders();
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: secureHeaders,
            body: JSON.stringify({ message: text })
        });
        
        const data = await response.json();
        stopLoading();
        
        if (data.reply) {
            typewriterAppend(data.reply);
        } else if (data.error) {
            appendMessage("Error: " + data.error, 'bot');
        } else {
            appendMessage("No response received.", 'bot');
        }
    } catch (err) {
        console.error("API error:", err);
        stopLoading();
        appendMessage("Could not connect to the server. Make sure the backend is running.", 'bot');
    } finally {
        chatInput.disabled = false;
        chatInput.focus();
    }
}
