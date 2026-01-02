const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');
const Branch = require('../models/Branch');

dotenv.config();

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Clear existing data (optional - comment out if you want to keep existing data)
    // await User.deleteMany({});
    // await Branch.deleteMany({});

    // Create default branches
    const branches = ['C1', 'C2'];
    for (const branchName of branches) {
      const existingBranch = await Branch.findOne({ name: branchName });
      if (!existingBranch) {
        await Branch.create({ name: branchName });
        console.log(`Created branch: ${branchName}`);
      }
    }

    // Create default admin user
    const adminEmail = 'admin@tms.com';
    const existingAdmin = await User.findOne({ email: adminEmail });
    if (!existingAdmin) {
      await User.create({
        name: 'Admin User',
        email: adminEmail,
        password: 'admin123', // Change this in production!
        phone: '9990000000',
        role: 'Admin',
      });
      console.log('Created admin user: admin@tms.com / admin123');
    }

    // Create default finance user
    const financeEmail = 'finance@tms.com';
    const existingFinance = await User.findOne({ email: financeEmail });
    if (!existingFinance) {
      await User.create({
        name: 'Finance Manager',
        email: financeEmail,
        password: 'finance123', // Change this in production!
        phone: '9990000001',
        role: 'Finance',
      });
      console.log('Created finance user: finance@tms.com / finance123');
    }

    // Create sample agents
    const agents = [
      { name: 'Amit Sharma', email: 'amit@tms.com', phone: '9990001111', branch: 'C1' },
      { name: 'Rahul Verma', email: 'rahul@tms.com', phone: '9990002222', branch: 'C1' },
      { name: 'Priya Patel', email: 'priya@tms.com', phone: '9990003333', branch: 'C2' },
      { name: 'Rajesh Kumar', email: 'rajesh@tms.com', phone: '9990004444', branch: 'C2' },
    ];

    for (const agentData of agents) {
      const existingAgent = await User.findOne({ email: agentData.email });
      if (!existingAgent) {
        await User.create({
          ...agentData,
          password: 'agent123', // Change this in production!
          role: 'Agent',
        });
        console.log(`Created agent: ${agentData.email} / agent123`);
      }
    }

    console.log('Seed data created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
};

seedData();

