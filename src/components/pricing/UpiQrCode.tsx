import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  ZoomIn,
  ZoomOut,
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { PAYMENT_CONFIG, generateUpiIntentUrl } from '../../config/paymentConfig';

interface UpiQrCodeProps {
  size?: number;
  className?: string;
  selectedUpiId?: string;
  customIntentUrl?: string;
  transactionRef?: string;
}

export const UpiQrCode: React.FC<UpiQrCodeProps> = ({
  size = 200,
  className = '',
  selectedUpiId = PAYMENT_CONFIG.UPI_ID,
  customIntentUrl,
  transactionRef,
}) => {
  const [activeUpi, setActiveUpi] = useState(selectedUpiId);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isZoomed, setIsZoomed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedAlt, setCopiedAlt] = useState(false);

  // Generate UPI Deep Link (Exact format: upi://pay?pa=legendxprince0-1@oksbi&pn=Prince&am=99&cu=INR&tr=...)
  const upiIntent = customIntentUrl || generateUpiIntentUrl(undefined, activeUpi, transactionRef);

  // Generate crisp local QR Code without external network dependencies
  useEffect(() => {
    QRCode.toDataURL(upiIntent, {
      width: size * 2,
      margin: 1,
      color: {
        dark: '#111827', // Crisp slate-900
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'H', // High error correction so logo in center works perfectly
    })
      .then((url) => {
        setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('Error generating QR code:', err);
      });
  }, [upiIntent, size, activeUpi]);

  const copyUpiId = async (idToCopy: string, isAlt = false) => {
    try {
      await navigator.clipboard.writeText(idToCopy);
      if (isAlt) {
        setCopiedAlt(true);
        setTimeout(() => setCopiedAlt(false), 2500);
      } else {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // Fallback
    }
  };

  return (
    <div className={`flex flex-col items-center justify-center w-full ${className}`}>
      {/* Prince's UPI Card Matching Exact Visual & Brand */}
      <div className="w-full max-w-xs bg-slate-900 text-white rounded-3xl p-4 sm:p-5 shadow-xl border border-slate-800 space-y-3.5 relative overflow-hidden">
        {/* Subtle Ambient Glow */}
        <div className="absolute -top-10 -right-10 w-28 h-28 bg-indigo-600/20 rounded-full blur-2xl pointer-events-none" />

        {/* Card Header: Avatar & Prince Name */}
        <div className="flex items-center justify-center gap-2.5 pt-1">
          <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-black text-sm flex items-center justify-center shadow-inner ring-2 ring-blue-400/40">
            P
          </div>
          <div className="text-left">
            <h4 className="font-extrabold text-base text-white leading-tight">
              {PAYMENT_CONFIG.UPI_DISPLAY_NAME}
            </h4>
            <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Verified Merchant
            </span>
          </div>
        </div>

        {/* QR Code Container */}
        <div className="relative mx-auto bg-white p-2.5 rounded-2xl shadow-md group max-w-[210px] flex items-center justify-center">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`Scan to pay ${PAYMENT_CONFIG.UPI_DISPLAY_NAME}`}
              className="w-full h-auto object-contain rounded-xl"
            />
          ) : (
            <div
              className="flex items-center justify-center bg-slate-100 rounded-xl animate-pulse"
              style={{ width: size, height: size }}
            >
              <span className="text-xs text-slate-400 font-bold">Generating QR...</span>
            </div>
          )}

          {/* Center Google Pay Style Logo Badge */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-9 h-9 rounded-full bg-white shadow-md border border-slate-200 flex items-center justify-center p-1.5">
              <svg viewBox="0 0 24 24" className="w-6 h-6">
                {/* Google Pay Multicolor Ribbon Icon */}
                <path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3l-2.4 2.4A4.1 4.1 0 0 0 4.5 12" fill="#EA4335" />
                <path d="M12 19.5a7.5 7.5 0 0 1-5.3-2.2l2.4-2.4a4.1 4.1 0 0 0 7.4-2.9h-4.5V9h7.7a7.5 7.5 0 0 1-7.7 10.5" fill="#4285F4" />
                <path d="M6.7 17.3A7.5 7.5 0 0 1 4.5 12h3.4a4.1 4.1 0 0 0 1.2 2.9z" fill="#FBBC05" />
                <path d="M12 19.5c1.8 0 3.5-.6 4.8-1.7l-2.4-2.4a4.1 4.1 0 0 1-2.4.7z" fill="#34A853" />
              </svg>
            </div>
          </div>

          {/* Enlarge Zoom Button */}
          <button
            type="button"
            onClick={() => setIsZoomed(true)}
            className="absolute bottom-2 right-2 p-1 rounded-lg bg-slate-900/80 text-white hover:bg-slate-900 transition-all text-xs opacity-80 group-hover:opacity-100 cursor-pointer shadow-sm"
            title="Enlarge QR Code"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Scan instruction label */}
        <p className="text-center text-[11px] text-slate-300 font-medium">
          Scan to pay with any UPI app
        </p>

        {/* State Bank of India Badge */}
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl py-1.5 px-3 flex items-center justify-center gap-2">
          {/* SBI Emblem Icon */}
          <div className="w-5 h-5 rounded-md bg-[#002f6c] flex items-center justify-center p-0.5 shrink-0">
            <div className="w-3 h-3 rounded-full bg-cyan-400 relative flex items-center justify-center">
              <div className="w-1 h-1.5 bg-[#002f6c] absolute bottom-0"></div>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-200">
            {PAYMENT_CONFIG.BANK_NAME} 7540
          </span>
        </div>

        {/* Primary UPI ID copy bar */}
        <div className="space-y-1.5">
          <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-2 flex items-center justify-between gap-2">
            <div className="truncate text-left pl-1">
              <span className="text-[9px] text-slate-400 uppercase font-black tracking-wider block">
                Primary UPI ID
              </span>
              <span className="font-mono text-xs font-bold text-indigo-300 truncate block">
                {PAYMENT_CONFIG.UPI_ID}
              </span>
            </div>
            <button
              type="button"
              onClick={() => copyUpiId(PAYMENT_CONFIG.UPI_ID, false)}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-transform active:scale-95 flex items-center gap-1 shrink-0 cursor-pointer shadow-xs"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-300" />
                  <span className="text-[11px]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span className="text-[11px]">Copy</span>
                </>
              )}
            </button>
          </div>

          {/* Alternate UPI Handle (ICICI handle from GPay) */}
          {PAYMENT_CONFIG.UPI_ID_ALT && (
            <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
              <span>Alt: <span className="font-mono text-slate-300">{PAYMENT_CONFIG.UPI_ID_ALT}</span></span>
              <button
                type="button"
                onClick={() => copyUpiId(PAYMENT_CONFIG.UPI_ID_ALT, true)}
                className="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-0.5 cursor-pointer"
              >
                {copiedAlt ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                <span>{copiedAlt ? 'Copied' : 'Copy Alt'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Enlarged QR Modal */}
      {isZoomed && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setIsZoomed(false)}
        >
          <div
            className="bg-slate-900 text-white rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl animate-in zoom-in-95 border border-slate-800 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center">
                  P
                </div>
                <div className="text-left">
                  <h4 className="font-extrabold text-sm text-white">{PAYMENT_CONFIG.UPI_DISPLAY_NAME}</h4>
                  <p className="text-[10px] text-slate-400">Pay ₹{PAYMENT_CONFIG.PRO_PRICE} via UPI</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsZoomed(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-white rounded-2xl shadow-inner flex items-center justify-center">
              {qrDataUrl && (
                <img
                  src={qrDataUrl}
                  alt="Enlarged QR Code"
                  className="w-64 h-64 object-contain rounded-xl"
                />
              )}
            </div>

            <div className="space-y-2">
              <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-mono font-bold flex items-center justify-between">
                <span className="text-indigo-300">{PAYMENT_CONFIG.UPI_ID}</span>
                <button
                  type="button"
                  onClick={() => copyUpiId(PAYMENT_CONFIG.UPI_ID)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-sans font-bold flex items-center gap-1 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                Copy your 12-digit UTR number after completing the transaction.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
