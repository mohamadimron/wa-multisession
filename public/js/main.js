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
    const sessionStatusesContainer = document.getElementById('session-statuses');
    const sendSessionSelect = document.getElementById('session-select-send'); // Ready sessions dropdown for sending messages

    // Track all sessions and their states
    // Start with no default session to avoid showing it if no folder exists
    const sessionStates = {};

    // --- Chat History Functionality ---
    const chatHistoryContainer = document.getElementById('chat-history-container');
    const chatHistoryContent = document.getElementById('chat-history-content');
    const chatHistoryLoading = document.getElementById('chat-history-loading');
    const loadChatHistoryBtn = document.getElementById('load-chat-history');
    const backToReadyBtn = document.getElementById('back-to-ready');
    const refreshChatHistoryBtn = document.getElementById('refresh-chat-history');
    const chatSearch = document.getElementById('chat-search');

    // --- Stopped Session Panel ---
    const whatsappStoppedContainer = document.getElementById('whatsapp-stopped');
    const startSessionBtn = document.getElementById('start-session-btn');

    // Function to create a session status item element
    function createSessionStatusItem(sessionId, status, phoneNumber = null) {
        const item = document.createElement('div');
        item.className = `session-status-item ${status.toLowerCase()}`;
        item.id = `session-status-${sessionId}`;
        item.dataset.sessionId = sessionId; // Add data attribute to identify session

        // Get status text and color based on status
        let statusText = status.toUpperCase();
        let statusColor = 'badge-secondary';
        let statusIcon = 'bi bi-question-circle';

        switch(status.toLowerCase()) {
            case 'ready':
                statusColor = 'badge-success';
                statusIcon = 'bi bi-check-circle';
                statusText = 'READY';
                break;
            case 'qr':
                statusColor = 'badge-warning text-dark';
                statusIcon = 'bi bi-qr-code';
                statusText = 'QR SCAN';
                break;
            case 'connecting':
            case 'authenticating':
            case 'starting...':
                statusColor = 'badge-info';
                statusIcon = 'bi bi-arrow-repeat';
                statusText = 'CONNECTING';
                break;
            case 'disconnected':
            case 'stopped':
                statusColor = 'badge-danger';
                statusIcon = 'bi bi-x-circle';
                statusText = 'STOPPED';
                break;
            case 'auth_failure':
                statusColor = 'badge-warning text-dark';
                statusIcon = 'bi bi-exclamation-triangle';
                statusText = 'AUTH FAIL';
                break;
            default:
                statusColor = 'badge-secondary';
                statusIcon = 'bi bi-dash-circle';
        }

        const phoneText = phoneNumber ? `+${phoneNumber}` : 'Waiting for connection...';

        item.innerHTML = `
            <div class="d-flex w-100 justify-content-between">
                <div class="session-name">
                    <i class="bi bi-whatsapp"></i>
                    <span>${sessionId}</span>
                </div>
                <div class="session-status ${statusColor}">
                    <i class="bi ${statusIcon}"></i>
                    <span>${statusText}</span>
                </div>
            </div>
            <div class="mt-1 phone-number-container">
                <small class="text-muted">
                    <i class="bi bi-telephone"></i>
                    <span class="phone-number">${phoneText}</span>
                </small>
            </div>
        `;

        // Add click event to select the session in the dropdown and display appropriate content based on status
        // REMARK: This function handles the flow when a session item is clicked in the list
        // It now sets the WhatsApp status to ready instead of automatically loading chat history
        item.addEventListener('click', async () => {
            sessionSelect.value = sessionId;
            sessionSelect.dispatchEvent(new Event('change')); // Trigger the change event to update UI

            // Update the UI based on the session status
            if (sessionStates[sessionId]) {
                const status = sessionStates[sessionId].status.toLowerCase();

                // Hide all panels first
                qrContainer.classList.add('d-none');
                whatsappReadyContainer.classList.add('d-none');
                chatHistoryContainer.classList.add('d-none');
                whatsappStoppedContainer.classList.add('d-none');

                if (status === 'ready') {
                    // For ready sessions, update status to ready and show the ready panel
                    updateWhatsappStatus('READY', 'success'); // Set status to ready instead of loading chat history
                    document.getElementById('ready-session-name').textContent = sessionId; // Show the session name
                    whatsappReadyContainer.classList.remove('d-none'); // Show the ready panel

                } else if (status === 'qr') {
                    // For QR sessions, show the QR code.
                    updateWhatsappStatus('QR SCAN', 'warning');
                    qrContainer.classList.remove('d-none');
                    // Load the saved QR code image for this session
                    loadSavedQrCode(sessionId);
                } else if (status === 'disconnected' || status === 'stopped') {
                    // For disconnected/stopped sessions, show stopped panel and update session name
                    document.getElementById('stopped-session-name').textContent = sessionId;
                    updateWhatsappStatus('STOPPED', 'danger');
                    whatsappStoppedContainer.classList.remove('d-none');
                } else {
                    // For other states (connecting, authenticating, etc.), update status accordingly
                    updateWhatsappStatus(sessionStates[sessionId].status, getStatusColor(sessionStates[sessionId].status));
                }

                // Update button states based on the selected session's status without hiding panels
                // We'll call a new function that only updates button visibility without hiding panels
                updateButtonState(sessionStates[sessionId].status);
            }
        });

        return item;
    }

    // Function to update session status in the UI
    function updateSessionStatusUI(sessionId, status, phoneNumber = null) {
        const existingItem = document.getElementById(`session-status-${sessionId}`);

        if (existingItem) {
            // Update existing item
            existingItem.className = `session-status-item ${status.toLowerCase()}`;
            existingItem.dataset.sessionId = sessionId; // Ensure dataset is updated

            // Update status text and color
            let statusText = status.toUpperCase();
            let statusColor = 'badge-secondary';
            let statusIcon = 'bi bi-question-circle';

            switch(status.toLowerCase()) {
                case 'ready':
                    statusColor = 'badge-success';
                    statusIcon = 'bi bi-check-circle';
                    statusText = 'READY';
                    break;
                case 'qr':
                    statusColor = 'badge-warning text-dark';
                    statusIcon = 'bi bi-qr-code';
                    statusText = 'QR SCAN';
                    break;
                case 'connecting':
                case 'authenticating':
                case 'starting...':
                    statusColor = 'badge-info';
                    statusIcon = 'bi bi-arrow-repeat';
                    statusText = 'CONNECTING';
                    break;
                case 'disconnected':
                case 'stopped':
                    statusColor = 'badge-danger';
                    statusIcon = 'bi bi-x-circle';
                    statusText = 'STOPPED';
                    break;
                case 'auth_failure':
                    statusColor = 'badge-warning text-dark';
                    statusIcon = 'bi bi-exclamation-triangle';
                    statusText = 'AUTH FAIL';
                    break;
                default:
                    statusColor = 'badge-secondary';
                    statusIcon = 'bi bi-dash-circle';
            }

            existingItem.querySelector('.session-status').className = `session-status ${statusColor}`;
            existingItem.querySelector('.session-status i').className = `bi ${statusIcon}`;
            existingItem.querySelector('.session-status span').textContent = statusText;

            // Update the session name text
            existingItem.querySelector('.session-name span').textContent = sessionId;

            // Update phone number if it exists
            const phoneEl = existingItem.querySelector('.phone-number');
            if (phoneEl && phoneNumber) {
                phoneEl.textContent = `+${phoneNumber}`;
            }

        } else {
            // Create new item
            const newItem = createSessionStatusItem(sessionId, status, phoneNumber);
            sessionStatusesContainer.appendChild(newItem);
        }

        // If this is the selected session, also update the main status badge
        if (sessionSelect.value === sessionId) {
            updateWhatsappStatus(status, getStatusColor(status));
        }
    }

    // Helper function to get appropriate color for status badge
    function getStatusColor(status) {
        switch(status.toLowerCase()) {
            case 'ready':
                return 'success';
            case 'qr':
            case 'authenticating':
                return 'warning';
            case 'connecting':
            case 'starting...':
                return 'info';
            case 'disconnected':
            case 'stopped':
            case 'auth_failure':
                return 'danger';
            default:
                return 'secondary';
        }
    }

    // Function to remove a session from the UI
    function removeSessionFromUI(sessionId) {
        const item = document.getElementById(`session-status-${sessionId}`);
        if (item) {
            item.remove();
        }
    }

    // Function to load saved QR code image for a session
    function loadSavedQrCode(sessionId) {
        if (!sessionId) return;

        // Construct the URL for the QR code image with cache-busting parameter
        const timestamp = new Date().getTime();
        const qrImageUrl = `/api/whatsapp/session/${sessionId}/qr?t=${timestamp}`;

        // Create a new image to test if it exists
        const testImage = new Image();
        testImage.onload = function() {
            // If image loads successfully, set it to the QR code display
            qrImage.src = qrImageUrl;
            console.log(`Loaded saved QR code image for session: ${sessionId}`);
        };
        testImage.onerror = function() {
            // If image doesn't exist, clear the QR display
            console.log(`No saved QR code image found for session: ${sessionId}`);
            qrImage.src = ''; // Clear the image
        };

        // Set the source to test if image exists
        testImage.src = qrImageUrl;
    }

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

        // Update session state to starting and update the UI immediately
        if (sessionStates[currentSession]) {
            sessionStates[currentSession].status = 'starting';
            updateSessionStatusUI(currentSession, 'starting'); // Update the session item in the list
        }

        // Disable the start button during initialization process
        btnStart.disabled = true;

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

        // Update session state to stopping and update the UI immediately
        if (sessionStates[currentSession]) {
            sessionStates[currentSession].status = 'stopping';
            updateSessionStatusUI(currentSession, 'stopping'); // Update the session item in the list
        }

        // Disable stop button during stop process to prevent multiple clicks
        btnStop.disabled = true;

        fetch('/api/whatsapp/stop', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId: currentSession })
        }).finally(() => {
            // Re-enable the stop button after a short delay to allow for status updates to propagate
            setTimeout(() => {
                btnStop.disabled = false;
            }, 1000);
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

                    // Update multisession status UI
                    updateSessionStatusUI(newSessionId.trim(), 'disconnected');

                    // Update the ready sessions dropdown to reflect current session status
                    updateReadySessionsDropdown();

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

                    // Remove from status UI
                    removeSessionFromUI(sessionToDelete);

                    // Switch back to default
                    sessionSelect.value = '';

                    // Update UI
                    manageUIState('disconnected');
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

    // Initialize the ready sessions dropdown after page loads
    updateReadySessionsDropdown();

    // Handle session selection change
    sessionSelect.addEventListener('change', () => {
        // Remove 'active' class from all session items
        document.querySelectorAll('.session-status-item').forEach(item => {
            item.classList.remove('active');
        });

        const selectedSession = sessionSelect.value;
        if (selectedSession && sessionStates[selectedSession]) {
            manageUIState(sessionStates[selectedSession].status);

            // If there's a stored QR code for this session, display it
            if (sessionStates[selectedSession].qr) {
                qrImage.src = sessionStates[selectedSession].qr;
                qrContainer.classList.remove('d-none');
            } else {
                qrContainer.classList.add('d-none');
            }

            // Add 'active' class to the selected session in the status list
            const sessionItem = document.getElementById(`session-status-${selectedSession}`);
            if (sessionItem) {
                sessionItem.classList.add('active');
            }

            // Hide all panels and let the status determine which to show
            qrContainer.classList.add('d-none');
            whatsappReadyContainer.classList.add('d-none');
            chatHistoryContainer.classList.add('d-none');
            whatsappStoppedContainer.classList.add('d-none');

            // Show appropriate panel based on status
            const status = sessionStates[selectedSession].status.toLowerCase();
            if (status === 'qr') {
                qrContainer.classList.remove('d-none');
                // Load the saved QR code image for this session
                loadSavedQrCode(selectedSession);
            } else if (status === 'ready') {
                // Don't show the basic "WhatsApp is Connected" panel, let user click to see chat history
                // Keep it hidden and they can click the "Load Chat History" button or session item
                document.getElementById('ready-session-name').textContent = selectedSession; // Set the session name
            } else if (status === 'disconnected' || status === 'stopped') {
                // Show stopped panel for disconnected sessions and update session name
                document.getElementById('stopped-session-name').textContent = selectedSession;
                whatsappStoppedContainer.classList.remove('d-none');
            } else {
                // For other states like connecting, authenticating, etc.
                updateWhatsappStatus(sessionStates[selectedSession].status, getStatusColor(sessionStates[selectedSession].status));
            }
        } else {
            // If no session is selected, just update UI to default state
            manageUIState('disconnected');

            // Ensure buttons are in proper state when no session is selected
            btnStart.disabled = false;
            btnStart.classList.remove('d-none');
            btnStop.classList.add('d-none');

            qrContainer.classList.add('d-none');
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

                // Clear existing session status items
                sessionStatusesContainer.innerHTML = '';

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

                        const phoneNumber = session.phoneNumber;
                        const status = session.status || (session.isReady ? 'ready' : 'disconnected');

                        // Update session state
                        if (!sessionStates[session.sessionId]) {
                            sessionStates[session.sessionId] = {
                                status: status,
                                qr: null,
                                phoneNumber: phoneNumber
                            };
                        }

                        // Add to multisession status UI
                        updateSessionStatusUI(session.sessionId, status, phoneNumber);

                        // Update the ready sessions dropdown to reflect current session status
                        updateReadySessionsDropdown();
                    }
                });

                // Update button states if a session is currently selected
                if (sessionSelect.value && sessionStates[sessionSelect.value]) {
                    updateButtonState(sessionStates[sessionSelect.value].status);

                    // If the selected session is in QR status, load the saved QR code
                    if (sessionStates[sessionSelect.value].status.toLowerCase() === 'qr') {
                        // Show QR container and load saved QR code
                        if (qrContainer) {
                            qrContainer.classList.remove('d-none');
                            loadSavedQrCode(sessionSelect.value);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error loading existing sessions:', error);
        }
    }

    // --- Server-Sent Events (SSE) for WhatsApp Status & QR ---
    function updateWhatsappStatus(text, color) {
        const currentSession = sessionSelect.value;
        whatsappStatusBadge.textContent = currentSession ? `${currentSession}: ${text}` : text;
        whatsappStatusBadge.className = `badge bg-${color} me-2`;
    }

    // Function to update only button states without affecting panel visibility
    function updateButtonState(state) {
        const status = state.toLowerCase();

        // Reset button disabled states first
        btnStart.disabled = false;
        btnStop.disabled = false;

        // Reset button visibility
        btnStart.classList.remove('d-none');
        btnStop.classList.add('d-none');

        if (status === 'ready') {
            btnStart.classList.add('d-none');
            btnStop.classList.remove('d-none');
        } else if (status === 'disconnected' || status === 'stopped' || status === 'loaded' || status === 'created') {
            btnStart.classList.remove('d-none');
            btnStop.classList.add('d-none');
        } else if (status === 'qr' || status === 'authenticating' || status === 'connecting' || status === 'starting' || status === 'auth_failure') {
            btnStart.classList.add('d-none');
            btnStop.classList.remove('d-none'); // Show stop button during transitional states
        } else { // For any other state, assume we can stop but not start
            btnStart.classList.add('d-none'); // Hide start button during transitional states
            btnStop.classList.remove('d-none'); // Show stop button during transitional states
        }
    }

    function manageUIState(state) {
        const status = state.toLowerCase();

        // Default state - hide all specific panels, let the click handlers decide what to show
        // Reset button disabled states first
        btnStart.disabled = false;
        btnStop.disabled = false;

        btnStart.classList.remove('d-none');
        btnStop.classList.add('d-none');
        qrContainer.classList.add('d-none');
        whatsappReadyContainer.classList.add('d-none');
        whatsappStoppedContainer.classList.add('d-none');
        chatHistoryContainer.classList.add('d-none');

        if (status === 'ready') {
            updateWhatsappStatus('READY', 'success');
            btnStart.classList.add('d-none');
            btnStop.classList.remove('d-none');
            // Update the ready session name when status is ready
            const currentSession = sessionSelect.value;
            if (currentSession && sessionStates[currentSession]) {
                document.getElementById('ready-session-name').textContent = currentSession; // Set the session name
            }
            // Don't automatically show whatsappReadyContainer - let user click to see options
        } else if (status === 'disconnected' || status === 'stopped') {
            updateWhatsappStatus('STOPPED', 'danger');
            btnStart.classList.remove('d-none');
            btnStop.classList.add('d-none');
            // Don't automatically show whatsappStoppedContainer - let user click to see options
        } else if (status === 'qr') {
            updateWhatsappStatus('QR SCAN', 'warning');
            btnStart.classList.add('d-none');
            btnStop.classList.remove('d-none'); // Show stop button during QR scan
            // Don't automatically show qrContainer - let user click to see options
        } else { // Connecting, authenticating, etc.
            updateWhatsappStatus(state, 'info');
            btnStart.classList.add('d-none'); // Hide start button during transitional states
            btnStop.classList.remove('d-none'); // Show stop button during transitional states
        }
    }

    console.log('Connecting to /qr-stream for WhatsApp status...');
    const sse = new EventSource('/qr-stream');

    sse.addEventListener('status', (e) => {
        const payload = JSON.parse(e.data);
        const { sessionId, message, details } = payload;
        console.log('SSE event: status -', message, 'for session', sessionId, details ? 'details: ' + details : '');

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

        let status = message.toLowerCase().includes('stop') ? 'disconnected' :
                     message.toLowerCase().includes('auth_failure') ? 'auth_failure' : message;

        // Store previous status to check for transitions
        const previousStatus = sessionStates[sessionId]?.status || 'disconnected';

        sessionStates[sessionId].status = status;

        // Update the multisession status UI
        updateSessionStatusUI(sessionId, status);

        // Update the ready sessions dropdown to reflect current session status
        updateReadySessionsDropdown();

        // If this is the currently selected session, update the main UI
        if (sessionSelect.value === sessionId) {
            manageUIState(sessionStates[sessionId].status);

            // Update what's displayed based on the new status if user hasn't actively switched views
            const currentStatus = sessionStates[sessionId].status.toLowerCase();

            // Only update display if not currently viewing chat history
            if (chatHistoryContainer.classList.contains('d-none')) {
                qrContainer.classList.add('d-none');
                whatsappReadyContainer.classList.add('d-none');
                whatsappStoppedContainer.classList.add('d-none');

                if (currentStatus === 'qr') {
                    qrContainer.classList.remove('d-none');
                } else if (currentStatus === 'ready') {
                    document.getElementById('ready-session-name').textContent = sessionId; // Set the session name
                    // Don't automatically show ready panel - user can click to see chat history
                } else if (currentStatus === 'disconnected' || currentStatus === 'stopped') {
                    document.getElementById('stopped-session-name').textContent = sessionId; // Set the session name
                    whatsappStoppedContainer.classList.remove('d-none');
                }
            }

            // Handle button state transitions based on status changes - only if this is the currently selected session
            if (sessionId === sessionSelect.value) {
                if (previousStatus === 'starting') {
                    btnStart.disabled = false; // Re-enable start button since we're no longer in "starting" state
                }

                // Update button state based on the new status without hiding panels
                updateButtonState(sessionStates[sessionId].status);
            }
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

        // Store previous status to check for transitions
        const previousStatus = sessionStates[sessionId]?.status || 'disconnected';

        sessionStates[sessionId].qr = dataUrl;
        sessionStates[sessionId].status = 'qr';

        // Update the multisession status UI
        updateSessionStatusUI(sessionId, 'qr');

        // Update the ready sessions dropdown to reflect current session status
        updateReadySessionsDropdown();

        // If this is the currently selected session, update the UI
        if (sessionSelect.value === sessionId) {
            manageUIState('qr');
            updateWhatsappStatus('QR SCAN', 'warning');

            // Update what's displayed based on the new status if user hasn't actively switched views
            // Only update display if not currently viewing chat history
            if (chatHistoryContainer.classList.contains('d-none')) {
                qrContainer.classList.add('d-none');
                whatsappReadyContainer.classList.add('d-none');
                whatsappStoppedContainer.classList.add('d-none');

                // Show QR code panel
                qrContainer.classList.remove('d-none');
                // Load the saved QR code image for this session
                loadSavedQrCode(sessionId);
            }

            // When QR status is received, re-enable the start button and ensure stop button is visible - only if this is the currently selected session
            if (sessionId === sessionSelect.value) {
                if (previousStatus === 'starting') {
                    btnStart.disabled = false; // Re-enable start button since we're no longer in "starting" state
                }

                // Update button state based on the new status without hiding panels
                updateButtonState(sessionStates[sessionId].status);
            }
        }
    });

    sse.addEventListener('ready', (e) => {
        console.log('SSE event: ready');
        const payload = JSON.parse(e.data);
        const { sessionId, message, phoneNumber } = payload; // <-- phoneNumber added

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

        // Store previous status to check for transitions
        const previousStatus = sessionStates[sessionId]?.status || 'disconnected';

        sessionStates[sessionId].status = 'ready';

        // Update the multisession status UI
        updateSessionStatusUI(sessionId, 'ready');

        // ---- NEW LOGIC START ----
        const sessionItem = document.getElementById(`session-status-${sessionId}`);
        if (sessionItem) {
            const phoneEl = sessionItem.querySelector('.phone-number');
            if (phoneEl) {
                phoneEl.textContent = phoneNumber ? `+${phoneNumber}` : 'N/A';
            }
        }
        // ---- NEW LOGIC END ----

        // Update the ready sessions dropdown to reflect current session status
        updateReadySessionsDropdown();

        // If this is the currently selected session, update the UI
        if (sessionSelect.value === sessionId) {
            manageUIState('ready');
            updateWhatsappStatus('READY', 'success');
            document.getElementById('ready-session-name').textContent = sessionId; // Set the session name
            console.log('--ready');
            // Update what's displayed based on the new status if user hasn't actively switched views
            // Only update display if not currently viewing chat history
            if (chatHistoryContainer.classList.contains('d-none')) {
                qrContainer.classList.add('d-none');
                whatsappReadyContainer.classList.add('d-none');
                whatsappStoppedContainer.classList.add('d-none');

                // Show ready panel when status becomes ready
                document.getElementById('ready-session-name').textContent = sessionId;
                whatsappReadyContainer.classList.remove('d-none');
            }

            // When session becomes ready, re-enable the start button and show the stop button - only if this is the currently selected session
            if (sessionId === sessionSelect.value) {
                if (previousStatus === 'starting') {
                    btnStart.disabled = false; // Re-enable start button since we're no longer in "starting" state
                }

                // Update button state based on the new status without hiding panels
                updateButtonState(sessionStates[sessionId].status);
            }
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

        // Store previous status to check for transitions
        const previousStatus = sessionStates[sessionId]?.status || 'disconnected';

        sessionStates[sessionId].status = 'disconnected';

        // Update the multisession status UI
        updateSessionStatusUI(sessionId, 'disconnected');

        // Update the ready sessions dropdown to reflect current session status
        updateReadySessionsDropdown();

        // If this is the currently selected session, update the UI
        if (sessionSelect.value === sessionId) {
            manageUIState('disconnected');
            updateWhatsappStatus('STOPPED', 'danger');

            // Update what's displayed based on the new status if user hasn't actively switched views
            // Only update display if not currently viewing chat history
            if (chatHistoryContainer.classList.contains('d-none')) {
                qrContainer.classList.add('d-none');
                whatsappReadyContainer.classList.add('d-none');
                whatsappStoppedContainer.classList.add('d-none');

                // Show stopped panel and update session name
                document.getElementById('stopped-session-name').textContent = sessionId;
                whatsappStoppedContainer.classList.remove('d-none');
            }

            // When session disconnects, re-enable the start button if it was previously disabled - only if this is the currently selected session
            if (sessionId === sessionSelect.value) {
                btnStart.disabled = false; // Always enable start button when disconnected
                // Update button state based on the new status without hiding panels
                updateButtonState(sessionStates[sessionId].status);
            }
        }
    });

    // Add comprehensive WhatsApp event listeners
    sse.addEventListener('message', (e) => {
        const payload = JSON.parse(e.data);
        const { sessionId, message } = payload;

        console.log('SSE event: message -', message.body || `[${message.type} message]`, 'for session', sessionId);

        // Add message log to the log container
        if (logContainer) {
            const logEntry = document.createElement('div');
            const timestamp = message.timestamp ? new Date(message.timestamp * 1000).toLocaleTimeString() : new Date().toLocaleTimeString();
            const prefix = sessionId ? `[${sessionId}] ` : '';
            const messageType = message.fromMe ? 'SENT' : 'RECEIVED';
            logEntry.className = `log-entry text-${message.fromMe ? 'info' : 'light'}`;
            logEntry.innerHTML = `<small>${timestamp}</small> ${prefix}[${messageType}] ${message.body || `[${message.type} message]`}`;
            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    });

    sse.addEventListener('message_create', (e) => {
        const payload = JSON.parse(e.data);
        const { sessionId, message } = payload;

        console.log('SSE event: message_create -', message.body || `[${message.type} message]`, 'for session', sessionId);

        // Add message creation log
        if (logContainer) {
            const logEntry = document.createElement('div');
            const timestamp = message.timestamp ? new Date(message.timestamp * 1000).toLocaleTimeString() : new Date().toLocaleTimeString();
            const prefix = sessionId ? `[${sessionId}] ` : '';
            logEntry.className = `log-entry text-info`;
            logEntry.innerHTML = `<small>${timestamp}</small> ${prefix}[MESSAGE CREATE] ${message.body || `[${message.type} message]`}`;
            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    });

    sse.addEventListener('message_ack', (e) => {
        const payload = JSON.parse(e.data);
        const { sessionId, messageId, status, timestamp } = payload;

        console.log('SSE event: message_ack -', status, 'for message', messageId, 'in session', sessionId);

        // Add message acknowledgment log
        if (logContainer) {
            const logEntry = document.createElement('div');
            const formattedTimestamp = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
            const prefix = sessionId ? `[${sessionId}] ` : '';
            logEntry.className = `log-entry text-info`;
            logEntry.innerHTML = `<small>${formattedTimestamp}</small> ${prefix}[MESSAGE ACK] ${status} - ${messageId}`;
            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    });

    sse.addEventListener('message_revoke_everyone', (e) => {
        const payload = JSON.parse(e.data);
        const { sessionId, message } = payload;

        console.log('SSE event: message_revoke_everyone -', 'for session', sessionId);

        // Add message revocation log
        if (logContainer) {
            const logEntry = document.createElement('div');
            const timestamp = message.timestamp ? new Date(message.timestamp * 1000).toLocaleTimeString() : new Date().toLocaleTimeString();
            const prefix = sessionId ? `[${sessionId}] ` : '';
            logEntry.className = `log-entry text-warning`;
            logEntry.innerHTML = `<small>${timestamp}</small> ${prefix}[MESSAGE REVOKED] Message was revoked by everyone`;
            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    });

    sse.addEventListener('message_revoke_me', (e) => {
        const payload = JSON.parse(e.data);
        const { sessionId, message } = payload;

        console.log('SSE event: message_revoke_me -', 'for session', sessionId);

        // Add message revocation log
        if (logContainer) {
            const logEntry = document.createElement('div');
            const timestamp = message.timestamp ? new Date(message.timestamp * 1000).toLocaleTimeString() : new Date().toLocaleTimeString();
            const prefix = sessionId ? `[${sessionId}] ` : '';
            logEntry.className = `log-entry text-warning`;
            logEntry.innerHTML = `<small>${timestamp}</small> ${prefix}[MESSAGE REVOKED BY ME] Message was revoked by me`;
            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    });

    sse.addEventListener('media_uploaded', (e) => {
        const payload = JSON.parse(e.data);
        const { sessionId, messageId } = payload;

        console.log('SSE event: media_uploaded -', 'for message', messageId, 'in session', sessionId);

        // Add media upload log
        if (logContainer) {
            const logEntry = document.createElement('div');
            const timestamp = new Date().toLocaleTimeString();
            const prefix = sessionId ? `[${sessionId}] ` : '';
            logEntry.className = `log-entry text-info`;
            logEntry.innerHTML = `<small>${timestamp}</small> ${prefix}[MEDIA UPLOADED] Media uploaded - ID: ${messageId}`;
            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    });

    // Group events
    sse.addEventListener('group_join', (e) => {
        const payload = JSON.parse(e.data);
        const { sessionId, notification } = payload;

        console.log('SSE event: group_join -', notification.body, 'in session', sessionId);

        // Add group join log
        if (logContainer) {
            const logEntry = document.createElement('div');
            const timestamp = notification.timestamp ? new Date(notification.timestamp * 1000).toLocaleTimeString() : new Date().toLocaleTimeString();
            const prefix = sessionId ? `[${sessionId}] ` : '';
            logEntry.className = `log-entry text-info`;
            logEntry.innerHTML = `<small>${timestamp}</small> ${prefix}[GROUP JOIN] ${notification.body}`;
            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    });

    sse.addEventListener('group_leave', (e) => {
        const payload = JSON.parse(e.data);
        const { sessionId, notification } = payload;

        console.log('SSE event: group_leave -', notification.body, 'in session', sessionId);

        // Add group leave log
        if (logContainer) {
            const logEntry = document.createElement('div');
            const timestamp = notification.timestamp ? new Date(notification.timestamp * 1000).toLocaleTimeString() : new Date().toLocaleTimeString();
            const prefix = sessionId ? `[${sessionId}] ` : '';
            logEntry.className = `log-entry text-warning`;
            logEntry.innerHTML = `<small>${timestamp}</small> ${prefix}[GROUP LEAVE] ${notification.body}`;
            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    });

    sse.addEventListener('group_update', (e) => {
        const payload = JSON.parse(e.data);
        const { sessionId, notification } = payload;

        console.log('SSE event: group_update -', notification.body, 'in session', sessionId);

        // Add group update log
        if (logContainer) {
            const logEntry = document.createElement('div');
            const timestamp = notification.timestamp ? new Date(notification.timestamp * 1000).toLocaleTimeString() : new Date().toLocaleTimeString();
            const prefix = sessionId ? `[${sessionId}] ` : '';
            logEntry.className = `log-entry text-info`;
            logEntry.innerHTML = `<small>${timestamp}</small> ${prefix}[GROUP UPDATE] ${notification.body}`;
            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    });

    // Contact and chat events
    sse.addEventListener('contact_changed', (e) => {
        const payload = JSON.parse(e.data);
        const { sessionId, oldId, newId } = payload;

        console.log('SSE event: contact_changed -', oldId, 'to', newId, 'in session', sessionId);

        // Add contact change log
        if (logContainer) {
            const logEntry = document.createElement('div');
            const timestamp = new Date().toLocaleTimeString();
            const prefix = sessionId ? `[${sessionId}] ` : '';
            logEntry.className = `log-entry text-info`;
            logEntry.innerHTML = `<small>${timestamp}</small> ${prefix}[CONTACT CHANGED] Contact changed from ${oldId} to ${newId}`;
            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    });

    sse.addEventListener('group_admin_changed', (e) => {
        const payload = JSON.parse(e.data);
        const { sessionId, notification } = payload;

        console.log('SSE event: group_admin_changed -', notification.body, 'in session', sessionId);

        // Add group admin change log
        if (logContainer) {
            const logEntry = document.createElement('div');
            const timestamp = notification.timestamp ? new Date(notification.timestamp * 1000).toLocaleTimeString() : new Date().toLocaleTimeString();
            const prefix = sessionId ? `[${sessionId}] ` : '';
            logEntry.className = `log-entry text-info`;
            logEntry.innerHTML = `<small>${timestamp}</small> ${prefix}[GROUP ADMIN CHANGED] ${notification.body}`;
            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    });

    let reconnectTimeout = null;

    sse.onerror = (err) => {
        console.error('SSE Connection Error:', err);
        updateWhatsappStatus('STREAM ERROR', 'danger');
        manageUIState('disconnected');

        // Attempt to reconnect after a delay
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
        }

        reconnectTimeout = setTimeout(() => {
            console.log('Attempting to reconnect to SSE stream...');
            sse.close();

            // Create a new EventSource with a delay to prevent rapid reconnection attempts
            setTimeout(() => {
                const newSSE = new EventSource('/qr-stream');

                newSSE.addEventListener('status', (e) => {
                    const payload = JSON.parse(e.data);
                    const { sessionId, message, details } = payload;
                    console.log('SSE event: status -', message, 'for session', sessionId, details ? 'details: ' + details : '');

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

                    let status = message.toLowerCase().includes('stop') ? 'disconnected' :
                                 message.toLowerCase().includes('auth_failure') ? 'auth_failure' : message;

                    // Store previous status to check for transitions
                    const previousStatus = sessionStates[sessionId]?.status || 'disconnected';

                    sessionStates[sessionId].status = status;

                    // Update the multisession status UI
                    updateSessionStatusUI(sessionId, status);

                    // Update the ready sessions dropdown to reflect current session status
                    updateReadySessionsDropdown();

                    // If this is the currently selected session, update the main UI
                    if (sessionSelect.value === sessionId) {
                        manageUIState(sessionStates[sessionId].status);

                        // Update what's displayed based on the new status if user hasn't actively switched views
                        const currentStatus = sessionStates[sessionId].status.toLowerCase();

                        // Only update display if not currently viewing chat history
                        if (chatHistoryContainer.classList.contains('d-none')) {
                            qrContainer.classList.add('d-none');
                            whatsappReadyContainer.classList.add('d-none');
                            whatsappStoppedContainer.classList.add('d-none');

                            if (currentStatus === 'qr') {
                                qrContainer.classList.remove('d-none');
                            } else if (currentStatus === 'ready') {
                                document.getElementById('ready-session-name').textContent = sessionId; // Set the session name
                                // Don't automatically show ready panel - user can click to see chat history
                                // BUT make sure the ready panel is properly prepared if user clicks
                            } else if (currentStatus === 'disconnected' || currentStatus === 'stopped') {
                                document.getElementById('stopped-session-name').textContent = sessionId; // Set the session name
                                whatsappStoppedContainer.classList.remove('d-none');
                            }
                        }

                        // Handle button state transitions based on status changes - only if this is the currently selected session
                        if (sessionId === sessionSelect.value) {
                            if (previousStatus === 'starting') {
                                btnStart.disabled = false; // Re-enable start button since we're no longer in "starting" state
                            }

                            // Update button state based on the new status without hiding panels
                            updateButtonState(sessionStates[sessionId].status);
                        }
                    }
                });

                newSSE.addEventListener('qr', (e) => {
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

                    // Store previous status to check for transitions
                    const previousStatus = sessionStates[sessionId]?.status || 'disconnected';

                    sessionStates[sessionId].qr = dataUrl;
                    sessionStates[sessionId].status = 'qr';

                    // Update the multisession status UI
                    updateSessionStatusUI(sessionId, 'qr');

                    // Update the ready sessions dropdown to reflect current session status
                    updateReadySessionsDropdown();

                    // If this is the currently selected session, update the UI
                    if (sessionSelect.value === sessionId) {
                        manageUIState('qr');
                        updateWhatsappStatus('QR SCAN', 'warning');

                        // Update what's displayed based on the new status if user hasn't actively switched views
                        // Only update display if not currently viewing chat history
                        if (chatHistoryContainer.classList.contains('d-none')) {
                            qrContainer.classList.add('d-none');
                            whatsappReadyContainer.classList.add('d-none');
                            whatsappStoppedContainer.classList.add('d-none');

                            // Show QR code panel
                            qrContainer.classList.remove('d-none');
                            // Load the saved QR code image for this session
                            loadSavedQrCode(sessionId);
                        }

                        // When QR status is received, re-enable the start button and ensure stop button is visible - only if this is the currently selected session
                        if (sessionId === sessionSelect.value) {
                            if (previousStatus === 'starting') {
                                btnStart.disabled = false; // Re-enable start button since we're no longer in "starting" state
                            }

                            // Update button state based on the new status without hiding panels
                            updateButtonState(sessionStates[sessionId].status);
                        }
                    }
                });

                newSSE.addEventListener('ready', (e) => {
                    console.log('SSE event: ready');
                    const payload = JSON.parse(e.data);
                    const { sessionId, message, phoneNumber } = payload;

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

                    // Store previous status to check for transitions
                    const previousStatus = sessionStates[sessionId]?.status || 'disconnected';

                    sessionStates[sessionId].status = 'ready';

                    // Update the multisession status UI
                    updateSessionStatusUI(sessionId, 'ready');

                    // Update phone number display
                    const sessionItem = document.getElementById(`session-status-${sessionId}`);
                    if (sessionItem) {
                        const phoneEl = sessionItem.querySelector('.phone-number');
                        if (phoneEl) {
                            phoneEl.textContent = phoneNumber ? `+${phoneNumber}` : 'N/A';
                        }
                    }

                    // Update the ready sessions dropdown to reflect current session status
                    updateReadySessionsDropdown();

                    // If this is the currently selected session, update the UI
                    if (sessionSelect.value === sessionId) {
                        manageUIState('ready');
                        updateWhatsappStatus('READY', 'success');
                        document.getElementById('ready-session-name').textContent = sessionId; // Set the session name
                        console.log('--ready');

                        // Update what's displayed based on the new status if user hasn't actively switched views
                        // Only update display if not currently viewing chat history
                        if (chatHistoryContainer.classList.contains('d-none')) {
                            qrContainer.classList.add('d-none');
                            whatsappReadyContainer.classList.add('d-none');
                            whatsappStoppedContainer.classList.add('d-none');

                            // Show ready panel when status becomes ready
                            document.getElementById('ready-session-name').textContent = sessionId;
                            whatsappReadyContainer.classList.remove('d-none');
                        }

                        // When session becomes ready, re-enable the start button and show the stop button - only if this is the currently selected session
                        if (sessionId === sessionSelect.value) {
                            if (previousStatus === 'starting') {
                                btnStart.disabled = false; // Re-enable start button since we're no longer in "starting" state
                            }

                            // Update button state based on the new status without hiding panels
                            updateButtonState(sessionStates[sessionId].status);
                        }
                    }
                });

                newSSE.addEventListener('disconnected', (e) => {
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

                    // Store previous status to check for transitions
                    const previousStatus = sessionStates[sessionId]?.status || 'disconnected';

                    sessionStates[sessionId].status = 'disconnected';

                    // Update the multisession status UI
                    updateSessionStatusUI(sessionId, 'disconnected');

                    // Update the ready sessions dropdown to reflect current session status
                    updateReadySessionsDropdown();

                    // If this is the currently selected session, update the UI
                    if (sessionSelect.value === sessionId) {
                        manageUIState('disconnected');
                        updateWhatsappStatus('STOPPED', 'danger');

                        // Update what's displayed based on the new status if user hasn't actively switched views
                        // Only update display if not currently viewing chat history
                        if (chatHistoryContainer.classList.contains('d-none')) {
                            qrContainer.classList.add('d-none');
                            whatsappReadyContainer.classList.add('d-none');
                            whatsappStoppedContainer.classList.add('d-none');

                            // Show stopped panel and update session name
                            document.getElementById('stopped-session-name').textContent = sessionId;
                            whatsappStoppedContainer.classList.remove('d-none');
                        }

                        // When session disconnects, re-enable the start button if it was previously disabled - only if this is the currently selected session
                        if (sessionId === sessionSelect.value) {
                            btnStart.disabled = false; // Always enable start button when disconnected
                            // Update button state based on the new status without hiding panels
                            updateButtonState(sessionStates[sessionId].status);
                        }
                    }
                });

                newSSE.onerror = (err) => {
                    console.error('SSE Connection Error (reconnection attempt):', err);
                    updateWhatsappStatus('STREAM ERROR', 'danger');
                    manageUIState('disconnected');
                };

                // Replace the old SSE reference with the new one
                window.sse = newSSE;
            }, 1000); // Wait 1 second before reconnecting
        }, 3000); // Attempt reconnection after 3 seconds
    };

    // Function to format timestamp to readable format
    function formatTimestamp(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp * 1000); // WhatsApp timestamps are in seconds
        return date.toLocaleString();
    }

    // Function to render messages in the chat history container
    function renderChatHistory(messages) {
        chatHistoryContent.innerHTML = ''; // Clear existing content

        if (!messages || messages.length === 0) {
            chatHistoryContent.innerHTML = '<div class="text-center text-muted py-3">No messages found</div>';
            return;
        }

        // Sort messages by timestamp (newest first)
        messages.sort((a, b) => b.timestamp - a.timestamp);

        messages.forEach(message => {
            const messageElement = document.createElement('div');
            messageElement.className = `chat-message ${message.fromMe ? 'sent' : 'received'}`;

            // Format the message content
            let content = message.body || '';
            if (message.hasMedia) {
                content = `[Media: ${message.type}]`;
            } else if (message.type === 'location') {
                content = `[Location shared]`;
            } else if (message.type === 'vcard') {
                content = `[Contact card]`;
            }

            // Create the message element with content and timestamp
            messageElement.innerHTML = `
                <div class="message-text">${content}</div>
                <div class="message-info ${message.fromMe ? 'sent' : 'received'}">
                    ${message.fromMe ? 'You' : (message.author || message.from)} • ${formatTimestamp(message.timestamp)}
                    ${message.isForwarded ? ' (Forwarded)' : ''}
                </div>
            `;

            chatHistoryContent.appendChild(messageElement);
        });
    }

    // Function to load chat history for the selected session
    async function loadChatHistory() {
        const sessionId = sessionSelect.value;
        if (!sessionId) {
            alert('Please select a session first!');
            return;
        }

        // Show loading indicator
        chatHistoryLoading.classList.remove('d-none');
        chatHistoryContent.innerHTML = '';

        try {
            const response = await fetch(`/api/whatsapp/chat-history/${sessionId}?limit=5`); // default 50
            const result = await response.json();

            if (result.status === 'success') {
                renderChatHistory(result.messages);
            } else {
                chatHistoryContent.innerHTML = `<div class="alert alert-danger">Error: ${result.message}</div>`;
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
            chatHistoryContent.innerHTML = `<div class="alert alert-danger">Error: ${error.message || 'Failed to load chat history'}</div>`;
        } finally {
            // Hide loading indicator
            chatHistoryLoading.classList.add('d-none');
        }
    }

    // Event listener for the Load Chat History button
    if (loadChatHistoryBtn) {
        loadChatHistoryBtn.addEventListener('click', async () => {
            // Hide the ready panel and show chat history
            whatsappReadyContainer.classList.add('d-none');
            chatHistoryContainer.classList.remove('d-none');

            // Load the chat history
            await loadChatHistory();
        });
    }

    // Event listener to go back from chat history to status-based view
    if (backToReadyBtn) {
        backToReadyBtn.addEventListener('click', () => {
            chatHistoryContainer.classList.add('d-none');

            // Show the appropriate panel based on session status
            const selectedSession = sessionSelect.value;
            if (selectedSession && sessionStates[selectedSession]) {
                const status = sessionStates[selectedSession].status.toLowerCase();

                // Reset to showing status-appropriate view
                if (status === 'ready') {
                    document.getElementById('ready-session-name').textContent = selectedSession; // Set the session name
                    whatsappReadyContainer.classList.remove('d-none');
                } else if (status === 'qr') {
                    qrContainer.classList.remove('d-none');
                } else if (status === 'disconnected' || status === 'stopped') {
                    document.getElementById('stopped-session-name').textContent = selectedSession; // Set the session name for stopped
                    whatsappStoppedContainer.classList.remove('d-none');
                }
            }
        });
    }

    // Event listener to refresh chat history
    if (refreshChatHistoryBtn) {
        refreshChatHistoryBtn.addEventListener('click', loadChatHistory);
    }

    // Chat search functionality
    if (chatSearch) {
        chatSearch.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const messages = chatHistoryContent.querySelectorAll('.chat-message');

            messages.forEach(message => {
                const text = message.textContent.toLowerCase();
                if (text.includes(searchTerm)) {
                    message.style.display = '';
                } else {
                    message.style.display = 'none';
                }
            });
        });
    }

    // Event listener for the Start Session button
    if (startSessionBtn) {
        startSessionBtn.addEventListener('click', () => {
            const sessionId = sessionSelect.value;
            if (!sessionId) {
                alert('Please select a session first!');
                return;
            }

            console.log(`Start session button clicked for session: ${sessionId}`);
            updateWhatsappStatus('STARTING...', 'info');

            // Update session state to starting and update the UI immediately
            if (sessionStates[sessionId]) {
                sessionStates[sessionId].status = 'starting';
                updateSessionStatusUI(sessionId, 'starting'); // Update the session item in the list
            }

            // Update button states to show that start is in progress
            btnStart.classList.add('d-none');
            btnStop.classList.remove('d-none');

            // Disable the start button during initialization process
            btnStart.disabled = true;

            fetch('/api/whatsapp/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ sessionId: sessionId })
            });
        });
    }

    // Function to update the ready sessions dropdown with only ready sessions
    // This function is called whenever session status changes to ensure the dropdown only shows ready sessions
    function updateReadySessionsDropdown() {
        // Check if the element exists before trying to use it
        if (!sendSessionSelect) {
            console.warn('sendSessionSelect element not found');
            return;
        }

        // First, clear the dropdown but keep the default option
        sendSessionSelect.innerHTML = '<option value="">-- Select a ready session --</option>';

        // Iterate through all session states and add only ready sessions to the dropdown
        for (const [sessionId, sessionData] of Object.entries(sessionStates)) {
            if (sessionData.status.toLowerCase() === 'ready') {
                const option = document.createElement('option');
                option.value = sessionId;

                // Include phone number if available
                if (sessionData.phoneNumber) {
                    option.textContent = `${sessionId} (+${sessionData.phoneNumber})`;
                } else {
                    option.textContent = sessionId;
                }

                sendSessionSelect.appendChild(option);
            }
        }
    }

    // --- Send Message Form ---
    if (sendMessageForm && sendSessionSelect) {
        sendMessageForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Prevent form refresh

            const phoneNumber = document.getElementById('phone-number').value;
            const message = document.getElementById('message').value;
            const sessionId = sendSessionSelect.value; // Use the ready session selected from the new dropdown

            if (!sessionId) {
                alert('Please select a ready session first!');
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