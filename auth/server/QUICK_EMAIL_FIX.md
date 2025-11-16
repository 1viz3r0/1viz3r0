# Quick Fix: Email Not Working

## The Problem
Your `.env` file has:
```
EMAIL_PASSWORD=your-app-specific-password
```
This is a **placeholder**, not a real password. You need to replace it with a real Gmail App Password.

## What is an App-Specific Password?

An **App-Specific Password** is a special 16-character password that Google gives you to let apps (like this server) access your Gmail account securely. It's NOT your regular Gmail password.

**Think of it like this:**
- Your regular Gmail password = Your house key
- App-Specific Password = A special guest key for apps

## Quick 3-Step Fix

### Step 1: Get Your App Password from Google

1. **Go to this link**: https://myaccount.google.com/apppasswords
   - (You might need to sign in)

2. **If you see "2-Step Verification" is off:**
   - Click "Get Started" and enable 2-Step Verification first
   - Google will text you a code to verify

3. **Generate App Password:**
   - Under "Select app": Choose **Mail**
   - Under "Select device": Choose **Other (Custom name)**
   - Type: `ONE-Go Security`
   - Click **Generate**

4. **Copy the 16-character password** (looks like: `abcd efgh ijkl mnop`)
   - ⚠️ Copy it NOW - you can't see it again!

### Step 2: Update Your .env File

Open `server/.env` file and change this line:

**FROM:**
```env
EMAIL_PASSWORD=your-app-specific-password
```

**TO:**
```env
EMAIL_PASSWORD=abcd efgh ijkl mnop
```
(Replace `abcd efgh ijkl mnop` with your actual 16-character App Password)

**Complete email section should look like:**
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=abcd efgh ijkl mnop
```

### Step 3: Restart Your Server

1. **Stop your server** (Press `Ctrl+C` in the terminal where server is running)
2. **Start it again** (`npm start` or `node server.js`)
3. **Look for this message**: `✅ Email transporter is ready to send messages`

## How to Know It's Working

When you restart your server, you should see:
```
✅ Email transporter is ready to send messages
```

If you see an error, the console will tell you exactly what's wrong.

## Still Having Issues?

### Can't Generate App Password?
- Make sure 2-Step Verification is enabled
- Try a different Google account
- Some work/school accounts have restrictions

### Still Getting Errors?
1. Double-check you copied the ENTIRE 16-character password
2. Make sure there are no extra spaces
3. Make sure you restarted the server after changing `.env`
4. Check the server console for specific error messages

### Can't Access App Passwords Page?
- Make sure you're signed in to the correct Google account
- Try this direct link: https://myaccount.google.com/apppasswords
- Some accounts need administrator approval

## Visual Guide

```
┌─────────────────────────────────────┐
│ Google Account → Security            │
│   → 2-Step Verification (ENABLE)    │
│   → App passwords                    │
│     → Select app: Mail               │
│     → Select device: Other           │
│     → Name: ONE-Go Security          │
│     → Generate                       │
│     → Copy: abcd efgh ijkl mnop      │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│ Update server/.env:                  │
│ EMAIL_PASSWORD=abcd efgh ijkl mnop   │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│ Restart Server                       │
│ Look for: ✅ Email transporter ready │
└─────────────────────────────────────┘
```

## Need More Help?

Check the detailed guide: `GMAIL_APP_PASSWORD_GUIDE.md`

