document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard script loaded.');
    
    // --- Element Selectors ---
    const logContainer = document.getElementById('log-container');
    const whatsappStatusBadge = document.getElementById('whatsapp-status-badge');
    const qrContainer = document.getElementById('qr-container');
    const qrImage = document.getElementById('qr-image');
    const whatsappReadyContainer = document.getElementById('whatsapp-ready');
    const sendMessageForm = document.getElementById('send-message-form');
    const sendButton = document.getElementById('send-button');
    const sendButtonSpinner = sendButton.querySelector('.spinner-border');
    const sendResult = document.getElementById('send-result');
    const btnStart = document.getElementById('btn-start-whatsapp');
    const btnStop = document.getElementById('btn-stop-whatsapp');

    // --- Socket.IO for Logs ---
    const logSocket = io();
    const systemStatusBadge = document.getElementById('status-badge');

    if (systemStatusBadge) {
        logSocket.on('connect', () => {
            systemStatusBadge.textContent = 'Connected';
            systemStatusBadge.classList.remove('bg-danger');
            systemStatusBadge.classList.add('bg-success');
        });
        logSocket.on('disconnect', () => {
            systemStatusBadge.textContent = 'Disconnected';
            systemStatusBadge.classList.remove('bg-success');
            systemStatusBadge.classList.add('bg-danger');
        });
    }

    if (logContainer) {
        logSocket.on('new_log', (log) => {
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry text-${log.type === 'error' ? 'danger' : 'light'}`;
            logEntry.innerHTML = `<small>${new Date(log.timestamp).toLocaleTimeString()}</small> [${log.type.toUpperCase()}] ${log.message}`;
            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight;
        });
    }

    // --- Control Button Logic ---
    btnStart.addEventListener('click', () => {
        console.log('Start button clicked');
        updateWhatsappStatus('STARTING...', 'info');
        fetch('/api/whatsapp/start', { method: 'POST' });
    });

    btnStop.addEventListener('click', () => {
        console.log('Stop button clicked');
        updateWhatsappStatus('STOPPING...', 'warning');
        fetch('/api/whatsapp/stop', { method: 'POST' });
    });

    // --- Server-Sent Events (SSE) for WhatsApp Status & QR ---
    function updateWhatsappStatus(text, color) {
        whatsappStatusBadge.textContent = text;
        whatsappStatusBadge.className = `badge bg-${color} me-2`;
    }

    function manageUIState(state) {
        // Default state
        btnStart.classList.add('d-none');
        btnStop.classList.add('d-none');
        qrContainer.classList.add('d-none');
        whatsappReadyContainer.classList.add('d-none');

        if (state === 'ready') {
            updateWhatsappStatus('READY', 'success');
            btnStop.classList.remove('d-none');
            whatsappReadyContainer.classList.remove('d-none');
        } else if (state === 'disconnected') {
            updateWhatsappStatus('STOPPED', 'danger');
            btnStart.classList.remove('d-none');
        } else if (state === 'qr') {
            updateWhatsappStatus('QR SCAN', 'warning');
            btnStop.classList.remove('d-none'); // Show stop button during QR scan
            qrContainer.classList.remove('d-none');
        } else { // Connecting, authenticating, etc.
            btnStop.classList.remove('d-none');
        }
    }

    console.log('Connecting to /qr-stream for WhatsApp status...');
    const sse = new EventSource('/qr-stream');

    sse.addEventListener('status', (e) => {
        const payload = JSON.parse(e.data);
        console.log('SSE event: status -', payload.message);
        updateWhatsappStatus(payload.message, 'info');
    });

    sse.addEventListener('qr', (e) => {
        console.log('SSE event: qr');
        const payload = JSON.parse(e.data);
        qrImage.src = payload.dataUrl;
        manageUIState('qr');
    });

    sse.addEventListener('ready', (e) => {
        console.log('SSE event: ready');
        manageUIState('ready');
    });

    sse.addEventListener('disconnected', (e) => {
        console.log('SSE event: disconnected');
        manageUIState('disconnected');
    });

    sse.onerror = (err) => {
        console.error('SSE Connection Error:', err);
        updateWhatsappStatus('STREAM ERROR', 'danger');
        manageUIState('disconnected');
        sse.close();
    };

    // --- Send Message Form ---
    if (sendMessageForm) {
        sendMessageForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Prevent form refresh

            const phoneNumber = document.getElementById('phone-number').value;
            const message = document.getElementById('message').value;

            if (!phoneNumber || !message) {
                alert('Please fill in both phone number and message fields.');
                return;
            }

            // Show loading state
            sendButtonSpinner.classList.remove('d-none');
            sendButton.disabled = true;
            sendResult.innerHTML = '';

            try {
                const response = await fetch('/api/whatsapp/send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ number: phoneNumber, message: message })
                });

                const data = await response.json();

                if (data.status === 'success') {
                    sendResult.innerHTML = `<div class="alert alert-success">${data.message}</div>`;
                    document.getElementById('message').value = ''; // Clear message field
                } else {
                    sendResult.innerHTML = `<div class="alert alert-danger">Error: ${data.message}</div>`;
                }
            } catch (error) {
                console.error('Send message error:', error);
                sendResult.innerHTML = `<div class="alert alert-danger">Error: ${error.message || 'Failed to send message'}</div>`;
            } finally {
                // Reset loading state
                sendButtonSpinner.classList.add('d-none');
                sendButton.disabled = false;
            }
        });
    }
});
