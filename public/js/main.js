document.addEventListener('DOMContentLoaded', () => {
    const socket = io({
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
    });

    const statusBadge = document.getElementById('status-badge');
    const logContainer = document.getElementById('log-container');
    const settingsForm = document.getElementById('settings-form');
    const alertPlaceholder = document.getElementById('alert-placeholder');

    // --- Socket.IO Connection Status ---
    if (statusBadge) {
        socket.on('connect', () => {
            statusBadge.textContent = 'Connected';
            statusBadge.classList.remove('bg-danger');
            statusBadge.classList.add('bg-success');
        });

        socket.on('disconnect', () => {
            statusBadge.textContent = 'Disconnected';
            statusBadge.classList.remove('bg-success');
            statusBadge.classList.add('bg-danger');
        });

        socket.on('connect_error', () => {
            statusBadge.textContent = 'Connection Error';
            statusBadge.classList.remove('bg-success');
            statusBadge.classList.add('bg-danger');
        });
    }

    // --- Dashboard Page Logic ---
    if (logContainer) {
        // Fetch initial logs
        fetch('/api/logs?limit=100')
            .then(res => res.json())
            .then(logs => {
                logs.forEach(log => addLogEntry(log));
            })
            .catch(err => console.error('Failed to fetch initial logs:', err));

        // Listen for new logs
        socket.on('new_log', (log) => {
            addLogEntry(log);
        });
    }

    function addLogEntry(log) {
        const entry = document.createElement('div');
        entry.className = `log-entry log-${log.type}`;
        
        const timestamp = new Date(log.timestamp).toLocaleTimeString();

        entry.innerHTML = `
            <span class="log-timestamp">${timestamp}</span>
            <span class="log-type">[${log.type.toUpperCase()}]</span>
            <span class="log-message">${log.message}</span>
        `;
        
        logContainer.appendChild(entry);
        logContainer.scrollTop = logContainer.scrollHeight; // Auto-scroll to bottom
    }


    // --- Settings Page Logic ---
    if (settingsForm) {
        // Fetch current settings and populate the form
        fetch('/api/settings')
            .then(res => res.json())
            .then(settings => {
                document.getElementById('apiKey').value = settings.apiKey || '';
                document.getElementById('refreshInterval').value = settings.refreshInterval || '';
            })
            .catch(err => console.error('Failed to fetch settings:', err));

        // Handle form submission
        settingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const apiKey = document.getElementById('apiKey').value;
            const refreshInterval = document.getElementById('refreshInterval').value;

            fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey, refreshInterval }),
            })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    showAlert('Settings saved successfully!', 'success');
                } else {
                    showAlert('Error saving settings.', 'danger');
                }
            })
            .catch(err => {
                console.error('Error saving settings:', err);
                showAlert('Error saving settings.', 'danger');
            });
        });
    }

    function showAlert(message, type) {
        if (!alertPlaceholder) return;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = [
            `<div class="alert alert-${type} alert-dismissible" role="alert">`,
            `   <div>${message}</div>`,
            '   <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>',
            '</div>'
        ].join('');
        alertPlaceholder.append(wrapper);

        setTimeout(() => {
            wrapper.remove();
        }, 4000);
    }
});
