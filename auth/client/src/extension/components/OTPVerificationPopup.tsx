import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Mail, Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface OTPVerificationPopupProps {
  type: 'email' | 'mobile';
  value: string;
  onVerified: (otp: string) => void;
  onResend: () => void;
  onCancel: () => void;
}

export default function OTPVerificationPopup({ type, value, onVerified, onResend, onCancel }: OTPVerificationPopupProps) {
  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const { toast } = useToast();

  const handleVerify = async () => {
    if (otp.length !== 6) {
      toast({
        title: 'Invalid OTP',
        description: 'Please enter a 6-digit OTP',
        variant: 'destructive',
      });
      return;
    }

    setIsVerifying(true);
    onVerified(otp);
    setIsVerifying(false);
  };

  const handleResend = async () => {
    setIsResending(true);
    await onResend();
    setIsResending(false);
    toast({
      title: 'OTP Resent',
      description: `A new OTP has been sent to your ${type}`,
    });
  };

  return (
    <div className="p-6 bg-background">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold">OTP Verification</span>
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-bold mb-2">Verify Your {type === 'email' ? 'Email' : 'Phone'}</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {type === 'email' ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
          <span>Enter the OTP sent to {value}</span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="otp">Enter 6-Digit OTP</Label>
          <Input
            id="otp"
            type="text"
            maxLength={6}
            placeholder="000000"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            className="text-center text-2xl tracking-widest"
            autoFocus
          />
        </div>

        <Button
          type="button"
          className="w-full"
          onClick={handleVerify}
          disabled={isVerifying || otp.length !== 6}
        >
          {isVerifying ? 'Verifying...' : 'Verify OTP'}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleResend}
          disabled={isResending}
        >
          {isResending ? 'Sending...' : 'Resend OTP'}
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
