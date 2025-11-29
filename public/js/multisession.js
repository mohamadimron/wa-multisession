// Multisession management functions

// Create a new WhatsApp session
async function createSession() {
    const sessionId = document.getElementById('sessionIdInput').value.trim();
    if (!sessionId) {
        alert('Please enter a session ID');
        return;
    }

    try {
        const response = await fetch('/api/whatsapp/create-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId })
        });

        const result = await response.json();
        if (result.status === 'success') {
            alert(`Session ${sessionId} created successfully`);
            document.getElementById('sessionIdInput').value = '';
            updateSessionsList(); // Refresh the sessions list
        } else {
            alert(`Error: ${result.message}`);
        }
    } catch (error) {
        console.error('Error creating session:', error);
        alert('Error creating session');
    }
}

// Start a WhatsApp session
async function startSession(sessionId) {
    try {
        const response = await fetch('/api/whatsapp/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId })
        });

        const result = await response.json();
        if (result.status === 'success') {
            console.log(`Session ${sessionId} started`);
        } else {
            console.error(`Error starting session ${sessionId}:`, result.message);
            alert(`Error starting session: ${result.message}`);
        }
    } catch (error) {
        console.error('Error starting session:', error);
        alert('Error starting session');
    }
}

// Stop a WhatsApp session
async function stopSession(sessionId) {
    try {
        const response = await fetch('/api/whatsapp/stop', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId })
        });

        const result = await response.json();
        if (result.status === 'success') {
            console.log(`Session ${sessionId} stopped`);
        } else {
            console.error(`Error stopping session ${sessionId}:`, result.message);
            alert(`Error stopping session: ${result.message}`);
        }
    } catch (error) {
        console.error('Error stopping session:', error);
        alert('Error stopping session');
    }
}

// Delete a WhatsApp session
async function deleteSession(sessionId) {
    if (!confirm(`Are you sure you want to delete session ${sessionId}?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/whatsapp/session/${sessionId}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (result.status === 'success') {
            console.log(`Session ${sessionId} deleted`);
            updateSessionsList(); // Refresh the sessions list
        } else {
            console.error(`Error deleting session ${sessionId}:`, result.message);
            alert(`Error deleting session: ${result.message}`);
        }
    } catch (error) {
        console.error('Error deleting session:', error);
        alert('Error deleting session');
    }
}

// Get the list of all sessions
async function updateSessionsList() {
    try {
        const response = await fetch('/api/whatsapp/sessions');
        const result = await response.json();

        if (result.status === 'success') {
            const sessions = result.sessions;
            const container = document.getElementById('sessionsContainer');
            
            // Clear the container
            container.innerHTML = '';
            
            if (sessions.length === 0) {
                container.innerHTML = '<p>No sessions created yet.</p>';
                return;
            }

            // Create a card for each session
            sessions.forEach(session => {
                const sessionCard = document.createElement('div');
                sessionCard.className = 'session-card';
                sessionCard.innerHTML = `
                    <div class="session-info">
                        <h3>Session: ${session.sessionId}</h3>
                        <p>Status: <span class="status ${session.isReady ? 'ready' : 'not-ready'}">${session.isReady ? 'Ready' : 'Not Ready'}</span></p>
                        <p>Client: <span class="status ${session.clientExists ? 'ready' : 'not-ready'}">${session.clientExists ? 'Exists' : 'Not Created'}</span></p>
                    </div>
                    <div class="session-actions">
                        <button onclick="startSession('${session.sessionId}')" ${session.isReady ? 'disabled' : ''}>Start</button>
                        <button onclick="stopSession('${session.sessionId}')" ${!session.isReady ? 'disabled' : ''}>Stop</button>
                        <button onclick="deleteSession('${session.sessionId}')" class="delete-btn">Delete</button>
                    </div>
                `;
                container.appendChild(sessionCard);
            });
        } else {
            console.error('Error getting sessions:', result.message);
        }
    } catch (error) {
        console.error('Error getting sessions:', error);
    }
}

// Initialize the sessions list when the page loads
document.addEventListener('DOMContentLoaded', function() {
    updateSessionsList();
    
    // Refresh every 10 seconds
    setInterval(updateSessionsList, 10000);
});