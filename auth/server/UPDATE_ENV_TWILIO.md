# Update .env File for Twilio Verify

## Quick Update

Add this line to your `server/.env` file in the Twilio section:

```env
TWILIO_VERIFY_SERVICE_SID=YOUR_TWILIO_VERIFY_SERVICE_SID
```

## Complete Twilio Section

Your Twilio configuration should look like this:

```env
# Twilio SMS Configuration
TWILIO_ACCOUNT_SID=YOUR_TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN=YOUR_TWILIO_AUTH_TOKEN
TWILIO_VERIFY_SERVICE_SID=YOUR_TWILIO_VERIFY_SERVICE_SID
TWILIO_PHONE_NUMBER=+917702450488
```

**Note**: `TWILIO_PHONE_NUMBER` is optional when using Twilio Verify API, but you can keep it for reference.

## After Updating

1. Save the `.env` file
2. Restart your server: `npm start` or `node server.js`
3. Test registration to verify SMS OTP works

