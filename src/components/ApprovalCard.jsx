// ApprovalCard — premium approval UX with local preview state,
// step indicator, instant publish gate, and loading shimmer.
import { useState, useRef, useEffect } from 'react';
import { Upload, Sparkles, Link as LinkIcon, Check, AlertCircle, Edit, ChevronRight, Clipboard } from 'lucide-react';
import LoreMark from './LoreMark';

const PLACEHOLDER_URL = 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?q=80&w=800';

function isValidImage(url) {
  return url && url.trim() !== '' && url !== PLACEHOLDER_URL;
}

export default function ApprovalCard({ story, onSaveImage, onPublish, onEdit }) {
  // Local preview tracks the image immediately after any save action
  const initialPreview = (isValidImage(story.hero_image) && !story.image_missing) ? story.hero_image : null;
  const [previewUrl, setPreviewUrl]   = useState(initialPreview);
  const [imageFailed, setImageFailed] = useState(false);
  const [remoteUrl, setRemoteUrl]     = useState('');

  const getShortTitle = (title) => {
    if (!title) return '';
    const parts = title.split(/[:\-–—]/);
    return parts[0].trim();
  };

  const getHashGradient = (id) => {
    const hash = (id || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const gradients = [
      'radial-gradient(circle at center, #261E14 0%, #0F0B08 100%)',
      'radial-gradient(circle at center, #221415 0%, #0F0808 100%)',
      'radial-gradient(circle at center, #152219 0%, #080F0A 100%)',
      'radial-gradient(circle at center, #141B26 0%, #080B0F 100%)',
      'radial-gradient(circle at center, #1E1426 0%, #0B080F 100%)',
      'radial-gradient(circle at center, #262414 0%, #0F0E08 100%)'
    ];
    return gradients[hash % gradients.length];
  };
  const [aiPrompt, setAiPrompt]       = useState('');
  const [loading, setLoading]         = useState(false);
  const [loadingMethod, setLoadingMethod] = useState(null); // 'upload' | 'ai' | 'url'
  const [error, setError]             = useState('');
  const [publishing, setPublishing]   = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const validImg = (isValidImage(story.hero_image) && !story.image_missing) ? story.hero_image : null;
    setPreviewUrl(validImg);
    setImageFailed(false);
  }, [story.hero_image, story.image_missing]);

  // ── Helpers ──────────────────────────────────────────────────────────
  const saveAndPreview = async (fn) => {
    setError('');
    setLoading(true);
    setImageFailed(false);
    try {
      await fn();
    } catch (e) {
      setError(e.message || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
      setLoadingMethod(null);
    }
  };

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingMethod('upload');
    saveAndPreview(() => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          await onSaveImage(story.story_id, reader.result);
          setPreviewUrl(reader.result);
          resolve();
        } catch { reject(new Error('Failed to upload image file.')); }
      };
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(file);
    }));
  };

  const handleSaveRemoteUrl = () => {
    if (!remoteUrl.trim()) return;
    setLoadingMethod('url');
    saveAndPreview(async () => {
      await onSaveImage(story.story_id, remoteUrl.trim());
      setPreviewUrl(remoteUrl.trim());
      setRemoteUrl('');
    });
  };

  const handleGenerateAiImage = () => {
    setLoadingMethod('ai');
    
    const cat = story.category || '';
    const isDocumentType = cat === 'gov_experiments' || cat === 'conspiracy' || cat === 'cyber_mysteries';
    
    let enhanced;
    
    if (isDocumentType) {
      const defaultBase = `A photocopied declassified government document about ${story.title}`;
      const base = aiPrompt.trim() || defaultBase;
      enhanced = `${base.replace(/\.$/, '')}, photocopied declassified US government document scan, black typewritten ink text redacted with thick black marker, red ink SECRET stamp at top, vintage paper grain, photocopier scanner artifacts, authentic retro forensic document texture, raw evidence photo`;
    } else {
      const defaultBase = `A vintage forensic archive photo related to ${story.title}`;
      const base = aiPrompt.trim() || defaultBase;
      enhanced = `${base.replace(/\.$/, '')}, vintage grainy 1970s Polaroid police archival photo, flash glare reflection, low-key chiaroscuro lighting, deep atmospheric shadows, subtle analog film grain, muted realistic colors, authentic forensic photography details, shot on vintage film camera`;
    }

    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhanced)}?width=800&height=600&nologo=true&private=true&model=flux`;
    saveAndPreview(async () => {
      await onSaveImage(story.story_id, pollinationsUrl);
      setPreviewUrl(pollinationsUrl);
    });
  };

  const handlePublish = async () => {
    if (!previewUrl) return;
    setPublishing(true);
    try {
      await onPublish(story.story_id);
    } finally {
      setPublishing(false);
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────
  const isReady      = isValidImage(previewUrl);
  const step         = isReady ? 2 : 1;
  const categoryLabel = story.category?.replace(/_/g, ' ') ?? '';

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div
      className="rounded-2xl overflow-hidden text-left transition-all duration-200"
      style={{
        background: '#0D0B09',
        border: `1px solid ${isReady ? 'rgba(16,185,129,0.2)' : 'rgba(237,232,223,0.07)'}`,
        boxShadow: isReady
          ? '0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(16,185,129,0.04)'
          : '0 4px 20px rgba(0,0,0,0.4)',
      }}
    >
      {/* ── Top status bar ── */}
      <div
        className="flex items-center justify-between px-5 py-2.5"
        style={{
          background: isReady ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.05)',
          borderBottom: `1px solid ${isReady ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)'}`,
        }}
      >
        {/* Step indicator */}
        <div className="flex items-center gap-2">
          <StepDot active={step >= 1} done={step > 1} label="Add Image" />
          <ChevronRight className="w-3 h-3" style={{ color: 'rgba(143,138,130,0.3)' }} />
          <StepDot active={step >= 2} done={false} label="Publish" />
        </div>

        <span
          className="text-[7.5px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{
            color: isReady ? '#10B981' : '#EF4444',
            background: isReady ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${isReady ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.25)'}`,
          }}
        >
          {isReady ? '✓ Ready' : 'Needs Image'}
        </span>
      </div>

      {/* ── Main body ── */}
      <div className="flex flex-col lg:flex-row gap-0">

        {/* Left: preview + story info */}
        <div className="w-full lg:w-[280px] flex-shrink-0 p-5 flex flex-col gap-4" style={{ borderRight: '1px solid rgba(237,232,223,0.05)' }}>

          {/* Image area */}
          <div
            className="relative rounded-xl overflow-hidden"
            style={{ aspectRatio: '16/9', background: 'rgba(0,0,0,0.5)' }}
          >
            {previewUrl && !imageFailed ? (
              <>
                <img
                  src={previewUrl}
                  alt={story.title}
                  className="w-full h-full object-cover"
                  onError={() => setImageFailed(true)}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <span
                  className="absolute bottom-2 left-2 text-[7px] font-mono uppercase tracking-widest px-2 py-0.5 rounded"
                  style={{ background: 'rgba(0,0,0,0.7)', color: '#10B981' }}
                >
                  ✓ Cover set
                </span>
              </>
            ) : (
              /* Loading shimmer or empty placeholder */
              loading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <div className="w-full h-full absolute inset-0 animate-pulse" style={{ background: 'linear-gradient(90deg, #0D0B09, rgba(158,123,76,0.08), #0D0B09)' }} />
                  <span className="relative text-[9px] font-mono uppercase tracking-widest" style={{ color: 'rgba(158,123,76,0.6)' }}>
                    {loadingMethod === 'ai' ? 'Generating with Flux AI...' : 'Processing...'}
                  </span>
                </div>
              ) : (
                <div 
                  className="w-full h-full flex flex-col justify-between p-3 select-none relative font-mono overflow-hidden"
                  style={{ background: getHashGradient(story.story_id) }}
                >
                  {/* HUD borders */}
                  <div className="absolute top-2 left-2 text-[6px] tracking-widest text-[#9E7B4C]/45 uppercase">
                    CL-4 // EYES ONLY
                  </div>
                  <div className="absolute top-2 right-2 text-[6px] tracking-widest text-red-500/50 uppercase">
                    MISSING TELEMETRY
                  </div>
                  
                  <div className="flex-1 flex flex-col items-center justify-center text-center px-2 mt-2">
                    <h4 className="font-serif italic text-xs text-[#EDE8DF]/90 leading-snug line-clamp-2">
                      {getShortTitle(story.title)}
                    </h4>
                    <p className="text-[6px] uppercase tracking-widest text-[#9E7B4C]/40 mt-1">
                      SYS-VAL-REQUIRED
                    </p>
                  </div>
                  
                  <div className="flex justify-between items-center text-[5.5px] tracking-wider text-neutral-500/60 mt-1">
                    <span>SIG. {((story.story_id || '').charCodeAt(0) || 75) % 100} // ERR</span>
                    <span>NO DATA STACK</span>
                  </div>
                </div>
              )
            )}
          </div>

          {/* Story info */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <LoreMark size={7} color="#9E7B4C" />
              <span className="text-[8px] font-mono uppercase tracking-widest" style={{ color: '#9E7B4C', opacity: 0.75 }}>
                {categoryLabel}
              </span>
            </div>
            <h4 className="font-serif italic text-sm leading-snug" style={{ color: '#EDE8DF' }}>
              {story.title}
            </h4>
            <p className="text-[10px] leading-relaxed line-clamp-3" style={{ color: '#4A4540', fontFamily: 'sans-serif' }}>
              {story.hook}
            </p>
          </div>

          <button
            onClick={onEdit}
            className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-[9px] font-mono uppercase tracking-widest transition-colors cursor-pointer"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(237,232,223,0.08)',
              color: '#6A6560',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#EDE8DF'; e.currentTarget.style.borderColor = 'rgba(237,232,223,0.18)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#6A6560'; e.currentTarget.style.borderColor = 'rgba(237,232,223,0.08)'; }}
          >
            <Edit className="w-3 h-3" /> Edit Story
          </button>
        </div>

        {/* Right: image tools */}
        <div className="flex-1 p-5 flex flex-col gap-5">
          <h5
            className="text-[9px] font-mono uppercase tracking-widest font-bold"
            style={{ color: '#9E7B4C' }}
          >
            {isReady ? 'Change Cover Image' : 'Add Cover Image — Choose a method'}
          </h5>

          {/* Error */}
          {error && (
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171' }}
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* ─── Option 1: Flux AI ─── */}
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" style={{ color: '#818CF8' }} />
              <span className="text-[10px] font-semibold" style={{ color: '#EDE8DF' }}>Flux AI Generation</span>
              <span className="text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.15)', color: '#818CF8' }}>Recommended</span>
            </div>
            <textarea
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              placeholder={`Defaults to: "Cinematic dark photo of ${story.title?.slice(0, 40)}..."`}
              rows={2}
              className="w-full rounded-lg px-3 py-2 text-xs resize-none focus:outline-none font-sans"
              style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(99,102,241,0.2)',
                color: '#EDE8DF',
                caretColor: '#818CF8',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.5)'; }}
              onBlur={e  => { e.target.style.borderColor = 'rgba(99,102,241,0.2)'; }}
            />
            <button
              disabled={loading}
              onClick={handleGenerateAiImage}
              className="w-full py-2 rounded-lg text-[9px] font-mono font-bold uppercase tracking-widest transition-all active:scale-95 cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1.5"
              style={{
                background: 'rgba(99,102,241,0.15)',
                border: '1px solid rgba(99,102,241,0.3)',
                color: '#818CF8',
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {loading && loadingMethod === 'ai' ? 'Generating…' : 'Generate Cover'}
            </button>
          </div>

          {/* ─── Option 2: File upload ─── */}
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(237,232,223,0.07)' }}
          >
            <div className="flex items-center gap-2">
              <Upload className="w-3.5 h-3.5" style={{ color: '#9E7B4C' }} />
              <span className="text-[10px] font-semibold" style={{ color: '#EDE8DF' }}>Upload Local File</span>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            <button
              disabled={loading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 rounded-lg text-[9px] font-mono font-bold uppercase tracking-widest transition-all active:scale-95 cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1.5"
              style={{
                background: 'rgba(158,123,76,0.08)',
                border: '1px solid rgba(158,123,76,0.25)',
                color: '#9E7B4C',
              }}
            >
              <Upload className="w-3.5 h-3.5" />
              {loading && loadingMethod === 'upload' ? 'Uploading…' : 'Choose File'}
            </button>
          </div>

          {/* ─── Option 3: Remote URL ─── */}
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(237,232,223,0.07)' }}
          >
            <div className="flex items-center gap-2">
              <LinkIcon className="w-3.5 h-3.5" style={{ color: '#9E7B4C' }} />
              <span className="text-[10px] font-semibold" style={{ color: '#EDE8DF' }}>Paste Image URL</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={remoteUrl}
                onChange={e => setRemoteUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveRemoteUrl(); }}
                placeholder="https://..."
                className="flex-1 px-3 py-1.5 rounded-lg text-xs focus:outline-none font-mono"
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(237,232,223,0.08)',
                  color: '#EDE8DF',
                  caretColor: '#9E7B4C',
                }}
                onFocus={e => { e.target.style.borderColor = 'rgba(158,123,76,0.35)'; }}
                onBlur={e  => { e.target.style.borderColor = 'rgba(237,232,223,0.08)'; }}
              />
              <button
                disabled={loading || !remoteUrl.trim()}
                onClick={handleSaveRemoteUrl}
                className="px-4 py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-widest transition-all active:scale-95 cursor-pointer disabled:opacity-40"
                style={{
                  background: 'rgba(158,123,76,0.08)',
                  border: '1px solid rgba(158,123,76,0.25)',
                  color: '#9E7B4C',
                }}
              >
                {loading && loadingMethod === 'url' ? '…' : 'Save'}
              </button>
            </div>
          </div>

          {/* ─── Option 4: Clipboard Paste (Ctrl+V) ─── */}
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ 
              background: 'rgba(245,158,11,0.02)', 
              border: '1px dashed rgba(245,158,11,0.2)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clipboard className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[10px] font-semibold text-[#EDE8DF]">Instant Clipboard Paste</span>
              </div>
              <a
                href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent((story.title || '').split(/[:-]/)[0].trim() + ' conceptual art')}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[8.5px] font-mono tracking-widest text-amber-500 hover:underline cursor-pointer select-none bg-transparent border-0 p-0"
                style={{ textDecoration: 'none' }}
              >
                🔍 Search Google
              </a>
            </div>
            
            <div className="relative">
              <input
                type="text"
                placeholder="Click here and press Ctrl+V to paste image or URL..."
                onPaste={async (e) => {
                  e.preventDefault();
                  
                  let pastedText = e.clipboardData?.getData('text')?.trim() || '';
                  if (pastedText.startsWith('//')) {
                    pastedText = 'https:' + pastedText;
                  } else if (pastedText.startsWith('/') && !pastedText.startsWith('/content/')) {
                    pastedText = 'https://media.cnn.com' + pastedText;
                  }
                  
                  if (pastedText.startsWith('http') || pastedText.startsWith('data:image')) {
                    setLoadingMethod('url');
                    saveAndPreview(async () => {
                      await onSaveImage(story.story_id, pastedText);
                      setPreviewUrl(pastedText);
                    });
                    return;
                  }
                  
                  const items = e.clipboardData?.items;
                  if (items) {
                    for (let i = 0; i < items.length; i++) {
                      const item = items[i];
                      
                      // Handle image file upload
                      if (item.type.indexOf('image') !== -1) {
                        const file = item.getAsFile();
                        if (file) {
                          setLoadingMethod('upload');
                          saveAndPreview(() => new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = async () => {
                              try {
                                await onSaveImage(story.story_id, reader.result);
                                setPreviewUrl(reader.result);
                                resolve();
                              } catch { reject(new Error('Failed to save pasted image file.')); }
                            };
                            reader.onerror = () => reject(new Error('Failed to read pasted image file.'));
                            reader.readAsDataURL(file);
                          }));
                          return;
                        }
                      }
                    }
                  }
                }}
                className="w-full rounded-lg px-3 py-2 text-[10px] focus:outline-none font-mono"
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(245,158,11,0.15)',
                  color: '#EDE8DF',
                  caretColor: '#F59E0B',
                }}
                onFocus={e => { e.target.style.borderColor = 'rgba(245,158,11,0.4)'; }}
                onBlur={e  => { e.target.style.borderColor = 'rgba(245,158,11,0.15)'; }}
              />
            </div>
          </div>

          {/* ─── Publish ─── */}
          <div
            className="flex items-center justify-between gap-3 pt-1"
            style={{ borderTop: '1px solid rgba(237,232,223,0.06)', paddingTop: '16px' }}
          >
            <span
              className="text-[9px] font-mono"
              style={{ color: isReady ? '#10B981' : '#6A6560' }}
            >
              {isReady ? '✓ Cover image set — ready to go live' : '⚠ Add a cover image to publish'}
            </span>
            <button
              disabled={!isReady || publishing}
              onClick={handlePublish}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all duration-200 active:scale-95 cursor-pointer disabled:cursor-not-allowed"
              style={{
                background: isReady ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isReady ? 'rgba(16,185,129,0.4)' : 'rgba(237,232,223,0.08)'}`,
                color: isReady ? '#10B981' : '#4A4540',
                opacity: !isReady ? 0.5 : 1,
              }}
            >
              <Check className="w-3.5 h-3.5" />
              {publishing ? 'Publishing…' : 'Go Live'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Step indicator dot component
function StepDot({ active, done, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-4 h-4 rounded-full flex items-center justify-center transition-all duration-200"
        style={{
          background: done ? 'rgba(16,185,129,0.2)' : active ? 'rgba(158,123,76,0.2)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${done ? 'rgba(16,185,129,0.5)' : active ? 'rgba(158,123,76,0.5)' : 'rgba(237,232,223,0.1)'}`,
        }}
      >
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: done ? '#10B981' : active ? '#9E7B4C' : 'transparent' }}
        />
      </div>
      <span
        className="text-[8px] font-mono uppercase tracking-widest"
        style={{ color: active || done ? '#EDE8DF' : 'rgba(143,138,130,0.35)' }}
      >
        {label}
      </span>
    </div>
  );
}
