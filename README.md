# E-BANDOBAST Police Deployment Tracking System

A comprehensive real-time police deployment tracking system with GPS monitoring, automated alerts, and AI-powered performance analysis.

## 🚔 Features

### For Supervisors
- **Event Management**: Create and manage police deployment events
- **Officer Assignment**: Upload officer lists via Excel files
- **Real-time Monitoring**: Live GPS tracking with geofence alerts  
- **Performance Reports**: AI-generated performance summaries
- **Holiday Management**: Approve/reject officer holiday requests
- **SMS/Call Notifications**: Automated alerts via Twilio

### For Officers
- **Duty Assignment**: View assigned events and details
- **GPS Check-in**: Location-based check-in with geofence validation
- **Real-time Tracking**: Continuous location monitoring during duty
- **Holiday Requests**: Submit requests with proof documents
- **Emergency Alerts**: One-tap emergency assistance button

## 🛠 Tech Stack

- **Frontend**: EJS, Bootstrap 5, JavaScript
- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: Supabase (role-based)
- **Real-time**: Socket.IO for live updates
- **Notifications**: Twilio API (SMS + Voice calls)
- **AI Services**: Performance analysis and recommendations
- **PWA**: Service Worker for offline capabilities

## 📋 Prerequisites

- Node.js 16+ 
- MongoDB database
- Supabase account
- Twilio account (for notifications)

## ⚡ Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   # Configure your environment variables
   ```

3. **Database Setup**
   ```bash
   npm run seed
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

5. **Access the Application**
   - Open http://localhost:3000
   - Use the signup form to create accounts

## 🔧 Configuration

### Environment Variables

Create a `.env` file with:

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/police_tracking

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Twilio
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_phone

# Application
PORT=3000
CLIENT_URL=http://localhost:3000
JWT_SECRET=your_jwt_secret
NODE_ENV=development
```

### Supabase Setup

1. Create a new Supabase project
2. Enable email authentication
3. Add the Supabase URL and keys to your .env file
4. Configure RLS policies if needed

### Twilio Setup

1. Create a Twilio account
2. Get a phone number for SMS/calls
3. Add credentials to .env file

## 📱 PWA Installation

The app can be installed as a Progressive Web App:

1. Open the app in a supported browser
2. Look for the "Install" prompt
3. Add to home screen for native app experience

## 🗂 Project Structure

```
├── controllers/          # Business logic controllers
├── models/              # MongoDB schemas
├── routes/              # Express route handlers  
├── services/            # External service integrations
├── middleware/          # Authentication & validation
├── views/               # EJS templates
├── public/              # Static assets (CSS, JS, images)
├── socket/              # Socket.IO event handlers
├── utils/               # Utility functions and seeders
└── uploads/             # File uploads directory
```

## 🔐 Security Features

- **Role-based Authentication**: Supervisor vs Officer access control
- **JWT Tokens**: Secure session management with Supabase
- **Rate Limiting**: Protection against API abuse
- **Input Validation**: Sanitization of all user inputs
- **CORS Protection**: Configured for production security
- **Helmet.js**: Security headers and CSP

## 📊 Monitoring & Analytics

- **Real-time GPS Tracking**: 30-second interval updates
- **Geofence Monitoring**: Automated zone violation detection
- **Performance Metrics**: Attendance, response time, idle detection
- **AI-powered Reports**: Natural language performance summaries
- **Alert System**: Multi-channel notifications (SMS, calls, push)

## 🚀 Deployment

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

### Docker (Optional)
```bash
docker build -t e-bandobast .
docker run -p 3000:3000 e-bandobast
```

## 📈 Monitoring

The system includes comprehensive monitoring:

- Officer location tracking every 30 seconds
- Idle detection (>10 minutes without movement)
- Geofence violations (>5 minutes outside zone)
- Battery level monitoring
- Emergency alert system

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For technical support or questions:
- Create an issue on GitHub
- Contact the development team
- Check the documentation in the `/docs` folder

## 🔮 Roadmap

- [ ] Advanced map integration (Google Maps/MapBox)
- [ ] Mobile app development (React Native)
- [ ] Advanced AI analytics
- [ ] Multi-language support
- [ ] Integration with police database systems
- [ ] Facial recognition for check-ins
- [ ] Vehicle tracking integration