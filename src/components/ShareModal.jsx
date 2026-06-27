import { useState, useEffect, useRef } from 'react';
import { X, Copy, Check, Share2, MessageSquare, Send } from 'lucide-react';

export default function ShareModal({ isOpen, onClose, storyTitle, storyId, layerNum }) {
  const [copied, setCopied] = useState(false);
  const modalRef = useRef(null);

  // Generate deep-link url with active layer hash
  const shareUrl = `${window.location.origin}/#story-${storyId}-layer-${layerNum}`;

  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
      
      // ESC key listener
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, onClose]);

  // Click outside to close
  const handleBackdropClick = (e) => {
    if (modalRef.current && !modalRef.current.contains(e.target)) {
      onClose();
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.warn('Failed to copy link:', err);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `LORE Archive: ${storyTitle}`,
          text: `Explore this classified archive file on SevenDescents: "${storyTitle}"`,
          url: shareUrl,
        });
      } catch (err) {
        console.warn('Native share failed or cancelled:', err);
      }
    }
  };

  if (!isOpen) return null;

  // Social sharing links
  const xShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Explore this classified archive on LORE: "${storyTitle}"`)}&url=${encodeURIComponent(shareUrl)}`;
  const redditShareUrl = `https://www.reddit.com/submit?title=${encodeURIComponent(`LORE Archive: "${storyTitle}"`)}&url=${encodeURIComponent(shareUrl)}`;
  const whatsappShareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(`Explore this classified archive: "${storyTitle}" ${shareUrl}`)}`;

  const supportsNativeShare = typeof navigator.share === 'function';

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in"
      style={{
        animation: 'fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleUp {
          from { transform: scale(0.96) translateY(8px); opacity: 0; }
          to { transform: scale(1) translateY(0); opacity: 1; }
        }
      ` }} />

      <div
        ref={modalRef}
        className="relative w-full max-w-md rounded-xl overflow-hidden border border-neutral-800 bg-[#0C0A09]/95 p-6 md:p-7 shadow-2xl select-none"
        style={{
          borderColor: 'rgba(158, 123, 76, 0.15)',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.9), 0 0 40px rgba(158, 123, 76, 0.05)',
          animation: 'scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <span className="text-[9px] font-mono tracking-[0.25em] text-[#9E7B4C] uppercase font-bold block mb-1">
              SHARE CLASSIFIED ARCHIVE
            </span>
            <h3 className="font-serif italic text-lg sm:text-xl text-[#EDE8DF] leading-snug">
              {storyTitle}
            </h3>
            <span className="text-[8px] font-mono text-neutral-550 uppercase tracking-widest block mt-1.5">
              FILE ID: {storyId.toUpperCase()} · LAYER {layerNum} OF 7
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white transition-colors duration-200 focus:outline-none p-1 hover:rotate-90"
            style={{ transition: 'transform 0.25s ease, color 0.2s ease' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Link box */}
        <div className="mb-6">
          <label className="text-[8px] font-mono tracking-widest text-neutral-400 uppercase block mb-2 font-semibold">
            SECURED DEEP-LINK
          </label>
          <div className="flex items-center gap-2 bg-[#060504] border border-neutral-900 rounded-lg p-1.5">
            <input
              type="text"
              readOnly
              value={shareUrl}
              onClick={(e) => e.target.select()}
              className="flex-1 bg-transparent text-[10px] font-mono text-[#D4CFC7] px-2 focus:outline-none truncate"
            />
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 py-1.5 px-3 rounded-md font-mono text-[9px] tracking-wider transition-all duration-300 focus:outline-none uppercase ${
                copied
                  ? 'bg-emerald-950/40 border border-emerald-800/40 text-emerald-400'
                  : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:text-white active:scale-95'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy
                </>
              )}
            </button>
          </div>
          {copied && (
            <p className="text-[8px] font-mono text-emerald-400 tracking-wider uppercase mt-2 animate-pulse">
              ❖ SECURE DEEP-LINK ENCRYPTED & COPIED TO CLIPBOARD
            </p>
          )}
        </div>

        {/* Sharing Options */}
        <div className="space-y-4">
          {supportsNativeShare && (
            <button
              onClick={handleNativeShare}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-[#9E7B4C]/25 text-[#9E7B4C] bg-[#9E7B4C]/5 hover:bg-[#9E7B4C]/10 active:scale-98 transition-all duration-200 font-mono text-[10px] tracking-widest uppercase focus:outline-none"
            >
              <Share2 className="w-3.5 h-3.5" />
              Native Device Share
            </button>
          )}

          <div>
            <span className="text-[8px] font-mono tracking-widest text-neutral-500 uppercase block mb-3 font-semibold text-center">
              OR TRANSMIT VIA SOCIAL NETWORKS
            </span>
            <div className="grid grid-cols-3 gap-2">
              <a
                href={xShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center py-3.5 px-2 bg-neutral-950 border border-neutral-900 rounded-lg hover:border-neutral-700/60 hover:bg-neutral-900 transition-all duration-200 text-neutral-400 hover:text-white focus:outline-none"
              >
                <svg className="w-4 h-4 mb-2 text-[#EDE8DF]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                <span className="text-[8px] font-mono tracking-wider uppercase">Twitter / X</span>
              </a>

              <a
                href={redditShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center py-3.5 px-2 bg-neutral-950 border border-neutral-900 rounded-lg hover:border-neutral-700/60 hover:bg-neutral-900 transition-all duration-200 text-neutral-400 hover:text-white focus:outline-none"
              >
                <MessageSquare className="w-4 h-4 mb-2 text-[#EDE8DF]" />
                <span className="text-[8px] font-mono tracking-wider uppercase">Reddit</span>
              </a>

              <a
                href={whatsappShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center py-3.5 px-2 bg-neutral-950 border border-neutral-900 rounded-lg hover:border-neutral-700/60 hover:bg-neutral-900 transition-all duration-200 text-neutral-400 hover:text-white focus:outline-none"
              >
                <Send className="w-4 h-4 mb-2 text-[#EDE8DF]" />
                <span className="text-[8px] font-mono tracking-wider uppercase">WhatsApp</span>
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-neutral-950 flex justify-center">
          <p className="text-[7.5px] font-mono tracking-wider text-neutral-600 uppercase text-center leading-relaxed">
            SevenDescents Classified Material. Do not distribute to unauthorized channels.
          </p>
        </div>
      </div>
    </div>
  );
}
