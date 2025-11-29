document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard script loaded.');

    // --- Element Selectors ---
    const logContainer = document.getElementById('log-container');
    const sessionSelect = document.getElementById('session-select');
    const addSessionBtn = document.getElementById('add-session-btn');
    const deleteSessionBtn = document.getElementById('btn-delete-session');
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
    const systemStatusBadge = document.getElementById('status-badge');

    // Track all sessions and their states
    // Start with no default session to avoid showing it if no folder exists
    const sessionStates = {};

    // --- Socket.IO for Logs ---
    const logSocket = io();

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
            const timestamp = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
            const prefix = log.sessionId ? `[${log.sessionId}] ` : '';
            logEntry.className = `log-entry text-${log.type === 'error' ? 'danger' : 'light'}`;
            logEntry.innerHTML = `<small>${timestamp}</small> ${prefix}[${log.type.toUpperCase()}] ${log.message}`;
            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight;
        });
    }

    // --- Control Button Logic ---
    btnStart.addEventListener('click', () => {
        const currentSession = sessionSelect.value;
        if (!currentSession) {
            alert('Please select a session first!');
            return;
        }

        console.log(`Start button clicked for session: ${currentSession}`);
        updateWhatsappStatus('STARTING...', 'info');
        fetch('/api/whatsapp/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId: currentSession })
        });
    });

    btnStop.addEventListener('click', () => {
        const currentSession = sessionSelect.value;
        if (!currentSession) {
            alert('Please select a session first!');
            return;
        }

        console.log(`Stop button clicked for session: ${currentSession}`);
        updateWhatsappStatus('STOPPING...', 'warning');
        fetch('/api/whatsapp/stop', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId: currentSession })
        });
    });

    addSessionBtn.addEventListener('click', () => {
        const newSessionId = prompt('Enter new session name:');
        if (newSessionId && newSessionId.trim() !== '') {
            // Check if session already exists
            let sessionExists = false;
            for (let i = 0; i < sessionSelect.options.length; i++) {
                if (sessionSelect.options[i].value === newSessionId.trim()) {
                    sessionExists = true;
                    break;
                }
            }
            
            if (sessionExists) {
                alert(`Session "${newSessionId}" already exists!`);
                return;
            }
            
            // Create new session via API
            fetch('/api/whatsapp/create-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ sessionId: newSessionId.trim() })
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    // Add to dropdown
                    const option = document.createElement('option');
                    option.value = newSessionId.trim();
                    option.textContent = newSessionId.trim();
                    sessionSelect.appendChild(option);
                    
                    // Initialize state for this new session
                    sessionStates[newSessionId.trim()] = { status: 'disconnected', qr: null };
                    
                    // Select the new session
                    sessionSelect.value = newSessionId.trim();
                    
                    // Update UI based on the new session selection
                    manageUIState(sessionStates[newSessionId.trim()].status);
                    updateWhatsappStatus(`Session ${newSessionId.trim()} created`, 'info');
                } else {
                    alert(`Error creating session: ${data.message}`);
                }
            })
            .catch(error => {
                console.error('Error creating session:', error);
                alert(`Error creating session: ${error.message}`);
            });
        }
    });

    // Modal elements
    const deleteConfirmationModal = new bootstrap.Modal(document.getElementById('deleteConfirmationModal'));
    const sessionToDeleteElement = document.getElementById('sessionToDelete');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

    let sessionToDelete = null; // Variable to store the session to delete

    deleteSessionBtn.addEventListener('click', () => {
        const currentSession = sessionSelect.value;
        if (!currentSession) {
            alert('Please select a session to delete!');
            return;
        }

        // Set the session name in the modal
        sessionToDeleteElement.textContent = currentSession;
        sessionToDelete = currentSession;

        // Show the confirmation modal
        deleteConfirmationModal.show();
    });

    // Handle the confirmation button click
    confirmDeleteBtn.addEventListener('click', () => {
        if (sessionToDelete) {
            fetch(`/api/whatsapp/session/${sessionToDelete}`, {
                method: 'DELETE'
            })
            .then(response => response.json())
            .then(data => {
                // Hide the modal
                deleteConfirmationModal.hide();

                if (data.status === 'success') {
                    // Remove from dropdown
                    const option = sessionSelect.querySelector(`option[value="${sessionToDelete}"]`);
                    if (option) {
                        option.remove();
                    }

                    // Remove from state
                    delete sessionStates[sessionToDelete];

                    // Switch back to default
                    sessionSelect.value = 'default';

                    // Update UI
                    manageUIState(sessionStates['default'].status);
                    updateWhatsappStatus(`Session ${sessionToDelete} deleted`, 'info');

                    // Reset the variable
                    sessionToDelete = null;
                } else {
                    // Show error as an alert
                    alert(`Error deleting session: ${data.message}`);
                    // Reset the variable
                    sessionToDelete = null;
                }
            })
            .catch(error => {
                console.error('Error deleting session:', error);
                // Hide the modal
                deleteConfirmationModal.hide();
                alert(`Error deleting session: ${error.message}`);
                // Reset the variable
                sessionToDelete = null;
            });
        }
    });

    // Load existing sessions from server when page loads
    loadExistingSessions();

    // Handle session selection change
    sessionSelect.addEventListener('change', () => {
        const selectedSession = sessionSelect.value;
        if (sessionStates[selectedSession]) {
            manageUIState(sessionStates[selectedSession].status);

            // If there's a stored QR code for this session, display it
            if (sessionStates[selectedSession].qr) {
                qrImage.src = sessionStates[selectedSession].qr;
                qrContainer.classList.remove('d-none');
            } else {
                qrContainer.classList.add('d-none');
            }
        }
    });

    // Function to load existing sessions from server
    async function loadExistingSessions() {
        try {
            const response = await fetch('/api/whatsapp/sessions');
            const result = await response.json();

            if (result.status === 'success') {
                // Clear existing options except default
                Array.from(sessionSelect.options).forEach(option => {
                    if (option.value !== 'default') {
                        option.remove();
                    }
                });

                // Add all sessions from the server
                const sessions = result.sessions;
                sessions.forEach(session => {
                    if (session.sessionId !== 'default') {
                        // Add to dropdown if not already there
                        let sessionExists = false;
                        for (let i = 0; i < sessionSelect.options.length; i++) {
                            if (sessionSelect.options[i].value === session.sessionId) {
                                sessionExists = true;
                                break;
                            }
                        }

                        if (!sessionExists) {
                            const option = document.createElement('option');
                            option.value = session.sessionId;
                            option.textContent = session.sessionId;
                            sessionSelect.appendChild(option);
                        }

                        // Update session state
                        if (!sessionStates[session.sessionId]) {
                            sessionStates[session.sessionId] = {
                                status: session.isReady ? 'ready' : 'disconnected',
                                qr: null
                            };
                        }
                    }
                });
            }
        } catch (error) {
            console.error('Error loading existing sessions:', error);
        }
    }

    // --- Server-Sent Events (SSE) for WhatsApp Status & QR ---
    function updateWhatsappStatus(text, color) {
        const currentSession = sessionSelect.value;
        whatsappStatusBadge.textContent = `${currentSession}: ${text}`;
        whatsappStatusBadge.className = `badge bg-${color} me-2`;
    }

    function manageUIState(state) {
        // Default state
        btnStart.classList.remove('d-none');
        btnStop.classList.add('d-none');
        qrContainer.classList.add('d-none');
        whatsappReadyContainer.classList.add('d-none');

        if (state === 'ready') {
            updateWhatsappStatus('READY', 'success');
            btnStart.classList.add('d-none');
            btnStop.classList.remove('d-none');
            whatsappReadyContainer.classList.remove('d-none');
        } else if (state === 'disconnected') {
            updateWhatsappStatus('STOPPED', 'danger');
            btnStart.classList.remove('d-none');
            btnStop.classList.add('d-none');
        } else if (state === 'qr') {
            updateWhatsappStatus('QR SCAN', 'warning');
            btnStart.classList.add('d-none');
            btnStop.classList.remove('d-none'); // Show stop button during QR scan
            qrContainer.classList.remove('d-none');
        } else { // Connecting, authenticating, etc.
            updateWhatsappStatus(state, 'info');
            btnStop.classList.remove('d-none');
        }
    }

    console.log('Connecting to /qr-stream for WhatsApp status...');
    const sse = new EventSource('/qr-stream');

    sse.addEventListener('status', (e) => {
        const payload = JSON.parse(e.data);
        const { sessionId, message } = payload;
        console.log('SSE event: status -', message, 'for session', sessionId);
        
        // Update the state for this session
        if (!sessionStates[sessionId]) {
            sessionStates[sessionId] = { status: 'disconnected', qr: null };
            
            // Add to dropdown if not already there
            let sessionExists = false;
            for (let i = 0; i < sessionSelect.options.length; i++) {
                if (sessionSelect.options[i].value === sessionId) {
                    sessionExists = true;
                    break;
                }
            }
            
            if (!sessionExists) {
                const option = document.createElement('option');
                option.value = sessionId;
                option.textContent = sessionId;
                sessionSelect.appendChild(option);
            }
        }
        
        sessionStates[sessionId].status = message.toLowerCase().includes('ready') ? 'ready' : 
                                         message.toLowerCase().includes('stop') ? 'disconnected' : message;
        
        // If this is the currently selected session, update the UI
        if (sessionSelect.value === sessionId) {
            manageUIState(sessionStates[sessionId].status);
        }
    });

    sse.addEventListener('qr', (e) => {
        console.log('SSE event: qr');
        const payload = JSON.parse(e.data);
        const { sessionId, dataUrl } = payload;
        
        // Store the QR code for this session
        if (!sessionStates[sessionId]) {
            sessionStates[sessionId] = { status: 'qr', qr: null };
            
            // Add to dropdown if not already there
            let sessionExists = false;
            for (let i = 0; i < sessionSelect.options.length; i++) {
                if (sessionSelect.options[i].value === sessionId) {
                    sessionExists = true;
                    break;
                }
            }
            
            if (!sessionExists) {
                const option = document.createElement('option');
                option.value = sessionId;
                option.textContent = sessionId;
                sessionSelect.appendChild(option);
            }
        }
        
        sessionStates[sessionId].qr = dataUrl;
        sessionStates[sessionId].status = 'qr';
        
        // If this is the currently selected session, update the UI
        if (sessionSelect.value === sessionId) {
            qrImage.src = dataUrl;
            manageUIState('qr');
            updateWhatsappStatus('QR SCAN', 'warning');
        }
    });

    sse.addEventListener('ready', (e) => {
        console.log('SSE event: ready');
        const payload = JSON.parse(e.data);
        const { sessionId, message } = payload;
        
        // Update the state for this session
        if (!sessionStates[sessionId]) {
            sessionStates[sessionId] = { status: 'ready', qr: null };
            
            // Add to dropdown if not already there
            let sessionExists = false;
            for (let i = 0; i < sessionSelect.options.length; i++) {
                if (sessionSelect.options[i].value === sessionId) {
                    sessionExists = true;
                    break;
                }
            }
            
            if (!sessionExists) {
                const option = document.createElement('option');
                option.value = sessionId;
                option.textContent = sessionId;
                sessionSelect.appendChild(option);
            }
        }
        
        sessionStates[sessionId].status = 'ready';
        
        // If this is the currently selected session, update the UI
        if (sessionSelect.value === sessionId) {
            manageUIState('ready');
            updateWhatsappStatus('READY', 'success');
        }
    });

    sse.addEventListener('disconnected', (e) => {
        console.log('SSE event: disconnected');
        const payload = JSON.parse(e.data);
        const { sessionId, message } = payload;
        
        // Update the state for this session
        if (!sessionStates[sessionId]) {
            sessionStates[sessionId] = { status: 'disconnected', qr: null };
            
            // Add to dropdown if not already there
            let sessionExists = false;
            for (let i = 0; i < sessionSelect.options.length; i++) {
                if (sessionSelect.options[i].value === sessionId) {
                    sessionExists = true;
                    break;
                }
            }
            
            if (!sessionExists) {
                const option = document.createElement('option');
                option.value = sessionId;
                option.textContent = sessionId;
                sessionSelect.appendChild(option);
            }
        }
        
        sessionStates[sessionId].status = 'disconnected';
        
        // If this is the currently selected session, update the UI
        if (sessionSelect.value === sessionId) {
            manageUIState('disconnected');
            updateWhatsappStatus('STOPPED', 'danger');
        }
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
            const sessionId = sessionSelect.value; // Use the selected session

            if (!sessionId) {
                alert('Please select a session first!');
                return;
            }

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
                    body: JSON.stringify({ sessionId, number: phoneNumber, message: message })
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