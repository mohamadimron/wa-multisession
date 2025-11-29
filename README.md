# WhatsApp Multi-Session Dashboard

A web-based dashboard for managing multiple WhatsApp Web sessions with real-time status monitoring.

## Features

- **Multi-Session Management**: Create and manage multiple WhatsApp Web sessions simultaneously
- **Real-time Status Updates**: Monitor session status with visual indicators (ready, QR scan, disconnected, etc.)
- **Session Controls**: Start, stop, and delete sessions as needed
- **QR Code Display**: Shows QR codes for authentication when needed
- **Message Sending**: Send messages through specific sessions
- **System Logs**: View real-time log output

## UI Improvements (Latest Update)

- **Enhanced Layout**: Redesigned WhatsApp Service section with improved UI/UX
- **Status List**: Added multisession status list with visual indicators for each session state
- **Better Positioning**: Status badge now positioned above session list for better visibility
- **Visual Feedback**: Enhanced styling for QR code container and ready state display
- **Interactive Elements**: Added hover effects and active state highlighting
- **Responsive Design**: Improved responsive behavior for session controls

## Installation

1. Clone this repository
2. Install dependencies: `npm install`
3. Start the server: `npm start`
4. Visit `http://localhost:3000` in your browser

## Usage

1. Create a new session using the "+" button
2. Select the session from the dropdown
3. Click the play button to start the session
4. Scan the QR code with your phone if prompted
5. Once connected, send messages using the message form

## Session Status Indicators

- 🟢 **READY**: Session is connected and ready to send messages
- 🟡 **QR SCAN**: Waiting for QR code scan
- 🔵 **CONNECTING**: Session is connecting/authenticating
- 🔴 **STOPPED**: Session is not running
- 🟠 **AUTH FAIL**: Authentication failure

## Technologies Used

- Node.js
- Express.js
- WhatsApp Web JS
- Socket.IO
- Bootstrap 5
- HTML5/CSS3/JavaScript

## License

MIT