# TMS Backend API

Transport Management System Backend built with Node.js, Express, and MongoDB.

## Features

- **Role-based Authentication** (Admin, Agent, Finance)
- **Trip Management** (Create, Update, Close trips)
- **Financial Ledger** (Top-ups, Transfers, Payments)
- **Dispute Management** (Raise and resolve disputes)
- **Branch Management** (Admin only)
- **User Management** (Admin only)
- **Reports & Analytics**
- **Audit Logging**

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory:
```bash
# Copy the example file
cp env.example .env

# Or create manually with these values:
```
```
MONGO_URI=mongodb+srv://ankit:Ankit%401205patidar@cluster0.xoxzbbv.mongodb.net/tms-backend
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-min-32-characters
PORT=5000
NODE_ENV=development
```

**Note:** See `ENV_SETUP.md` for detailed environment variable configuration.

3. Start the server:
```bash
# Development mode (with nodemon)
npm run dev

# Production mode
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login user
- `GET /api/auth/me?userId=xxx` - Get current user (Public, requires userId query param)

### Users (Admin only)
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get single user
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Branches
- `GET /api/branches` - Get all branches
- `POST /api/branches` - Create branch (Admin only)
- `PUT /api/branches/:id` - Update branch (Admin only)
- `DELETE /api/branches/:id` - Delete branch (Admin only)

### Trips
- `GET /api/trips` - Get all trips (filtered by role)
- `GET /api/trips/:id` - Get single trip
- `POST /api/trips` - Create trip (Agent only)
- `PUT /api/trips/:id` - Update trip
- `DELETE /api/trips/:id` - Delete trip (Admin only)
- `POST /api/trips/:id/payments` - Add on-trip payment (Agent, Finance)
- `PUT /api/trips/:id/deductions` - Update deductions (Agent only)
- `POST /api/trips/:id/close` - Close trip (Agent, Admin)
- `POST /api/trips/:id/attachments` - Upload attachment (Finance, Admin)
- `DELETE /api/trips/:id/attachments/:attachmentId` - Delete attachment (Finance, Admin)

### Ledger
- `GET /api/ledger` - Get ledger entries (filtered by role)
- `GET /api/ledger/balance/:agentId` - Get agent balance
- `POST /api/ledger/topup` - Add top-up (Finance, Admin)
- `POST /api/ledger/transfer` - Transfer between agents (Agent only)

### Disputes
- `GET /api/disputes` - Get all disputes (filtered by role)
- `GET /api/disputes/:id` - Get single dispute
- `POST /api/disputes` - Create dispute (Agent only)
- `PUT /api/disputes/:id/resolve` - Resolve dispute (Admin only)

### Reports
- `GET /api/reports/dashboard` - Get dashboard statistics
- `GET /api/reports/trips` - Get trip report
- `GET /api/reports/ledger` - Get ledger report
- `GET /api/reports/agents` - Get agent performance report (Finance, Admin)

## Authentication

**All APIs are PUBLIC - No authentication token required!**

The login endpoint returns a token, but it's not required for other APIs. All endpoints work without authentication.

## Role Permissions

### Admin
- Full system access
- Can create/edit/delete users and branches
- Can resolve disputes
- Can close any trip
- Can upload/replace attachments

### Finance
- Can view all trips and ledger entries
- Can add top-ups (regular and virtual)
- Can upload/replace attachments
- Can update LR Sheet status
- Cannot create trips or close trips

### Agent
- Can create and manage own trips
- Can add on-trip payments
- Can raise disputes for active trips
- Can close own active trips
- Can transfer balance to other agents
- Cannot upload attachments
- Cannot modify LR Sheet status

## Database Models

- **User**: Users with roles (Admin, Agent, Finance)
- **Trip**: Trip records with financial tracking
- **Ledger**: Financial transaction entries
- **Dispute**: Dispute records
- **Branch**: Branch locations
- **AuditLog**: System audit trail

## File Uploads

Attachments are stored in the `uploads/` directory. Maximum 4 attachments per trip. Supported formats: JPEG, JPG, PNG, GIF, PDF. Maximum file size: 5MB.

## Error Handling

All errors are returned in JSON format:
```json
{
  "message": "Error message here"
}
```

## Notes

- Passwords are automatically hashed using bcrypt
- Login returns a token, but it's not required for other APIs
- All timestamps are in UTC
- Audit logs are created for all major operations

