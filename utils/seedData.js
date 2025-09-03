const mongoose = require('mongoose');
const User = require('../models/User');
const Event = require('../models/Event');
require('dotenv').config();

// Sample data for development and testing
const sampleUsers = [
  {
    supabaseId: 'supervisor-001',
    role: 'supervisor',
    name: 'Inspector Rajesh Kumar',
    email: 'supervisor@police.gov.in',
    phone: '+919876543210',
    department: 'Traffic Police',
    isActive: true
  },
  {
    supabaseId: 'officer-001',
    role: 'officer',
    name: 'Constable Amit Singh',
    email: 'amit.singh@police.gov.in',
    phone: '+919876543211',
    badgeNumber: 'DL001',
    department: 'Traffic Police',
    isActive: true
  },
  {
    supabaseId: 'officer-002',
    role: 'officer',
    name: 'Head Constable Priya Sharma',
    email: 'priya.sharma@police.gov.in',
    phone: '+919876543212',
    badgeNumber: 'DL002',
    department: 'Traffic Police',
    isActive: true
  },
  {
    supabaseId: 'officer-003',
    role: 'officer',
    name: 'Constable Ravi Patel',
    email: 'ravi.patel@police.gov.in',
    phone: '+919876543213',
    badgeNumber: 'DL003',
    department: 'Traffic Police',
    isActive: true
  }
];

const sampleEvents = [
  {
    name: 'Republic Day Parade Security',
    description: 'Security deployment for Republic Day parade at India Gate',
    date: new Date('2025-01-26'),
    startTime: '06:00',
    endTime: '14:00',
    location: {
      name: 'India Gate, New Delhi',
      coordinates: [77.2295, 28.6129], // [longitude, latitude]
      radius: 500
    },
    supervisorId: 'supervisor-001',
    requiredOfficers: 12,
    priority: 'critical',
    status: 'upcoming',
    officers: [
      {
        userId: 'officer-001',
        name: 'Constable Amit Singh',
        badgeNumber: 'DL001',
        phone: '+919876543211',
        email: 'amit.singh@police.gov.in',
        status: 'assigned'
      },
      {
        userId: 'officer-002', 
        name: 'Head Constable Priya Sharma',
        badgeNumber: 'DL002',
        phone: '+919876543212',
        email: 'priya.sharma@police.gov.in',
        status: 'assigned'
      }
    ],
    actualOfficers: 2
  },
  {
    name: 'Cricket Match Security',
    description: 'Security for IPL match at Arun Jaitley Stadium',
    date: new Date('2025-01-15'),
    startTime: '15:00',
    endTime: '23:00',
    location: {
      name: 'Arun Jaitley Stadium, Delhi',
      coordinates: [77.2426, 28.5906],
      radius: 300
    },
    supervisorId: 'supervisor-001',
    requiredOfficers: 8,
    priority: 'high',
    status: 'completed',
    officers: [
      {
        userId: 'officer-003',
        name: 'Constable Ravi Patel',
        badgeNumber: 'DL003',
        phone: '+919876543213',
        email: 'ravi.patel@police.gov.in',
        status: 'checked-out',
        checkInTime: new Date('2025-01-15T15:30:00'),
        checkOutTime: new Date('2025-01-15T23:15:00')
      }
    ],
    actualOfficers: 1
  }
];

async function seedDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/police_tracking', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB for seeding');

    // Clear existing data
    await User.deleteMany({});
    await Event.deleteMany({});
    console.log('Cleared existing data');

    // Insert sample users
    await User.insertMany(sampleUsers);
    console.log(`Inserted ${sampleUsers.length} sample users`);

    // Insert sample events
    await Event.insertMany(sampleEvents);
    console.log(`Inserted ${sampleEvents.length} sample events`);

    console.log('\n✅ Database seeding completed successfully!');
    console.log('\n📝 Sample Login Credentials:');
    console.log('Supervisor: supervisor@police.gov.in');
    console.log('Officer: amit.singh@police.gov.in');
    console.log('Password: Create accounts using signup form');

    process.exit(0);

  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase, sampleUsers, sampleEvents };