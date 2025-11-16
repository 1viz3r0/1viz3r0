# Email Setup Guide for ONE-Go Security

## Problem: Not Receiving OTP Emails

If you're not receiving OTP emails, follow these steps to configure email sending properly.

## For Gmail Users

### Step 1: Enable 2-Step Verification
1. Go to your Google Account: https://myaccount.google.com/
2. Navigate to **Security** → **2-Step Verification**
3. Enable 2-Step Verification if not already enabled

### Step 2: Generate an App Password
1. Go to: https://myaccount.google.com/apppasswords
2. Select **Mail** as the app
3. Select **Other (Custom name)** as the device
4. Enter "ONE-Go Security" as the name
5. Click **Generate**
6. Copy the 16-character password (no spaces)

### Step 3: Update .env File
Update your `server/.env` file with the following:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx
```

**Important**: 
- Use your Gmail address for `EMAIL_USER`
- Use the 16-character App Password (without spaces) for `EMAIL_PASSWORD`
- Do NOT use your regular Gmail password

## For Other Email Providers

### Outlook/Office 365
```env
EMAIL_HOST=smtp.office365.com
EMAIL_PORT=587
EMAIL_USER=your-email@outlook.com
EMAIL_PASSWORD=your-app-password
```

### Yahoo Mail
```env
EMAIL_HOST=smtp.mail.yahoo.com
EMAIL_PORT=587
EMAIL_USER=your-email@yahoo.com
EMAIL_PASSWORD=your-app-password
```

### Custom SMTP Server
```env
EMAIL_HOST=your-smtp-server.com
EMAIL_PORT=587
EMAIL_USER=your-email@domain.com
EMAIL_PASSWORD=your-password
```

## Testing Email Configuration

### Development Mode
When `NODE_ENV=development`, the server will:
1. Log OTP codes to the console if email sending fails
2. Include OTP codes in API responses for testing
3. Show detailed error messages

Check your server console when registering to see:
- `✅ Email transporter is ready to send messages` - Configuration is correct
- `❌ Email transporter verification failed` - Configuration needs fixing
- `📧 [DEV MODE] Email OTP for ...` - OTP logged to console (if email fails)

### Check Server Logs
After starting your server, you should see one of these messages:
- **Success**: `✅ Email transporter is ready to send messages`
- **Error**: `❌ Email transporter verification failed: [error details]`

### Common Errors

#### Error: "EAUTH" or "Invalid login"
- **Cause**: Wrong password or using regular password instead of App Password
- **Solution**: Generate a new App Password and update `.env`

#### Error: "ECONNECTION" or "ETIMEDOUT"
- **Cause**: Wrong EMAIL_HOST or EMAIL_PORT
- **Solution**: Verify SMTP server settings for your email provider

#### Error: "Email transporter not configured"
- **Cause**: Missing or incorrect environment variables
- **Solution**: Check that all EMAIL_* variables are set in `.env`

## Troubleshooting

1. **Check .env file location**: Make sure `.env` is in the `server/` directory
2. **Restart server**: After changing `.env`, restart your Node.js server
3. **Check spam folder**: Sometimes emails go to spam
4. **Verify email address**: Make sure the email address in your registration form is correct
5. **Check server logs**: Look for error messages in your server console

## Development Testing

In development mode, if email sending fails, the OTP will be:
1. Logged to server console
2. Included in API response as `devOTP` or `devEmailOTP`

You can check the browser console or server logs to get the OTP for testing.

## Need Help?

If you're still having issues:
1. Check server console for detailed error messages
2. Verify your email provider's SMTP settings
3. Make sure you're using App Passwords (for Gmail/Outlook)
4. Test with a different email provider if possible

