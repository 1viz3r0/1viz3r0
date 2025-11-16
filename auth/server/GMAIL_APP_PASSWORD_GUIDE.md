# Gmail App Password Setup Guide

## What is an App-Specific Password?

An **App-Specific Password** is a 16-character code that gives a less secure app or device permission to access your Google Account. It's different from your regular Gmail password and is required when you have 2-Step Verification enabled on your Google account.

**Why is it needed?**
- Gmail doesn't allow regular passwords for security reasons
- App passwords provide a secure way for apps to access your account
- Each app gets its own unique password
- You can revoke it anytime without changing your main password

## Step-by-Step Setup

### Step 1: Enable 2-Step Verification (If Not Already Enabled)

1. Go to your Google Account: https://myaccount.google.com/
2. Click on **Security** in the left sidebar
3. Under "Signing in to Google", find **2-Step Verification**
4. Click on it and follow the prompts to enable it
   - You'll need to verify your phone number
   - Google will send you a verification code

### Step 2: Generate an App Password

1. Go directly to App Passwords: https://myaccount.google.com/apppasswords
   - Or navigate: Google Account → Security → 2-Step Verification → App passwords

2. You might be asked to sign in again

3. At the bottom, click on **Select app** dropdown
   - Choose **Mail**

4. Click on **Select device** dropdown
   - Choose **Other (Custom name)**
   - Type: "ONE-Go Security" or "Node.js Server"

5. Click **Generate**

6. Google will show you a 16-character password like this:
   ```
   xxxx xxxx xxxx xxxx
   ```
   **Important**: Copy this password immediately - you won't be able to see it again!

### Step 3: Update Your .env File

Open your `server/.env` file and update it:

```env
# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx
```

**Important Notes:**
- Replace `your-email@gmail.com` with YOUR actual Gmail address
- Replace `xxxx xxxx xxxx xxxx` with the 16-character App Password you just generated
- You can include or remove spaces - both work
- Example: `EMAIL_PASSWORD=abcd efgh ijkl mnop` or `EMAIL_PASSWORD=abcdefghijklmnop`

### Step 4: Restart Your Server

After updating the `.env` file, you MUST restart your Node.js server:

1. Stop your server (Ctrl+C in the terminal)
2. Start it again: `npm start` or `node server.js`

### Step 5: Verify It's Working

When you start your server, check the console output. You should see:

```
✅ Email transporter is ready to send messages
```

If you see an error instead, check the error message for details.

## Example .env File

Here's what a complete email section should look like in your `.env`:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/one-go-security

# Email Configuration (Gmail)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=abcd efgh ijkl mnop
```

## Troubleshooting

### Error: "Invalid login" or "EAUTH"
- **Problem**: Wrong password or still using regular password
- **Solution**: Generate a new App Password and update `.env`

### Error: "2-Step Verification not enabled"
- **Problem**: You need to enable 2-Step Verification first
- **Solution**: Follow Step 1 above

### Error: "Cannot generate app password"
- **Problem**: Your Google account might have restrictions
- **Solution**: 
  - Make sure 2-Step Verification is enabled
  - Try using a different Google account
  - Check if your organization has restrictions

### Still Not Working?
1. Double-check the App Password - no extra spaces or characters
2. Make sure you copied the entire 16-character code
3. Restart your server after updating `.env`
4. Check server console for detailed error messages
5. Try generating a new App Password

## Security Note

- App passwords are secure and can only access Gmail
- You can revoke them anytime from your Google Account
- Each app should have its own App Password
- Never share your App Password with anyone

## Quick Checklist

- [ ] 2-Step Verification enabled
- [ ] App Password generated
- [ ] `.env` file updated with correct EMAIL_USER
- [ ] `.env` file updated with 16-character App Password
- [ ] Server restarted after updating `.env`
- [ ] Server console shows "✅ Email transporter is ready"

## Need Help?

If you're still having issues:
1. Check the server console for specific error messages
2. Verify your Gmail account settings
3. Try generating a new App Password
4. Make sure there are no typos in your `.env` file

