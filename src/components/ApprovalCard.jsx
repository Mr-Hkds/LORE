// 1. Imports
import { useState, useRef } from 'react';
import { Upload, Sparkles, Link as LinkIcon, Check, AlertCircle, Edit } from 'lucide-react';
import LoreMark from './LoreMark';

export default function ApprovalCard({ story, onSaveImage, onPublish, onEdit }) {
  // 5. State declarations
  const [remoteUrl, setRemoteUrl] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  // 7. Callbacks
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64Data = reader.result;
        await onSaveImage(story.story_id, base64Data);
      } catch {
        setError('Failed to upload image file.');
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => {
      setError('Failed to read image file.');
      setLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveRemoteUrl = async () => {
    if (!remoteUrl.trim()) return;
    setLoading(true);
    setError('');
    try {
      await onSaveImage(story.story_id, remoteUrl.trim());
      setRemoteUrl('');
    } catch {
      setError('Failed to download image from the provided URL.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAiImage = async () => {
    const promptText = aiPrompt.trim() || `A cinematic, atmospheric dark photo of ${story.title}, ${story.hook || 'highly realistic, dramatic lighting'}`;
    setLoading(true);
    setError('');
    try {
      const enhancedPrompt = `${promptText.replace(/\.$/, '')}, cinematic 35mm photograph, documentary photojournalism style, low-key chiaroscuro lighting, deep atmospheric shadows, subtle film grain, muted colors, authentic textures, dark history archive aesthetic, shot on Leica M6, realistic details`;
      const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=800&height=600&nologo=true&private=true&model=flux`;
      await onSaveImage(story.story_id, pollinationsUrl);
    } catch {
      setError('Failed to generate image with Flux AI.');
    } finally {
      setLoading(false);
    }
  };

  // 8. Derived state
  const hasThumbnail = story.hero_image && 
                       story.hero_image !== 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?q=80&w=800' && 
                       story.hero_image.trim() !== '';

  // 10. Main render
  return (
    <div className="bg-[#0D0B09] border border-neutral-900 rounded-2xl p-6 flex flex-col lg:flex-row gap-6 text-left transition-all hover:border-[#9E7B4C]/20 shadow-md">
      {/* Left side: Thumbnail preview and basic story info */}
      <div className="w-full lg:w-[260px] flex flex-col gap-4 flex-shrink-0">
        <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-neutral-900 bg-black/60 flex items-center justify-center dossier-image-container">
          {hasThumbnail ? (
            <img
              src={story.hero_image}
              alt={story.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-4 text-center text-neutral-600">
              <AlertCircle className="w-8 h-8 text-[#9E7B4C]/40 mb-2" />
              <span className="text-[9px] font-mono tracking-widest uppercase font-bold text-[#8F8A82]/50">No Thumbnail</span>
              <span className="text-[8px] font-mono text-neutral-700 mt-1">Classification: {story.category}</span>
            </div>
          )}

          {/* Quick status badge */}
          <div className="absolute top-2 left-2 z-10">
            <span className={`text-[7px] font-mono font-bold tracking-widest uppercase px-2 py-0.5 rounded-md ${
              hasThumbnail ? 'bg-emerald-950/80 border border-emerald-500/30 text-emerald-400' : 'bg-red-950/80 border border-red-500/30 text-red-400'
            }`}>
              {hasThumbnail ? 'Ready' : 'Pending Image'}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[8px] font-mono tracking-widest uppercase text-[#9E7B4C]/70">
            <LoreMark size={8} color="currentColor" />
            <span>{story.category}</span>
          </div>
          <h4 className="font-serif italic text-base text-[#EDE8DF] leading-snug">{story.title}</h4>
          <p className="text-[10px] font-mono text-neutral-600">{story.story_id}</p>
        </div>

        <button
          onClick={onEdit}
          className="w-full py-2 bg-neutral-950 hover:bg-neutral-900 border border-neutral-800 text-[#EDE8DF] text-[9px] font-mono font-bold tracking-widest uppercase rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
        >
          <Edit className="w-3 h-3" /> Edit Full Story
        </button>
      </div>

      {/* Right side: Interactive Image Tools */}
      <div className="flex-1 flex flex-col justify-between gap-6 border-t lg:border-t-0 lg:border-l border-neutral-900/60 pt-6 lg:pt-0 lg:pl-6">
        <div className="space-y-4">
          <h5 className="text-[10px] font-mono tracking-widest uppercase text-[#9E7B4C] font-bold">Cover Image Tools</h5>

          {error && (
            <div className="p-3 bg-red-950/30 border border-red-500/20 text-red-400 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Tabs for Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Upload Local File */}
            <div className="p-4 bg-black/20 border border-neutral-900/60 rounded-xl space-y-3 flex flex-col justify-between">
              <div className="space-y-1">
                <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block font-bold">Option 1</span>
                <span className="text-[11px] font-semibold text-[#EDE8DF] block">Local File Upload</span>
                <p className="text-[10px] text-[#8F8A82]/70 leading-relaxed">Select a custom jpg or png from your computer</p>
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  disabled={loading}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2 bg-[#9E7B4C]/10 border border-[#9E7B4C]/30 text-[#EDE8DF] text-[9px] font-mono font-bold tracking-widest uppercase rounded-lg hover:bg-[#9E7B4C]/25 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" /> {loading ? 'Processing...' : 'Choose File'}
                </button>
              </div>
            </div>

            {/* 2. Generate AI Thumbnail */}
            <div className="p-4 bg-black/20 border border-neutral-900/60 rounded-xl space-y-3 flex flex-col justify-between md:col-span-2">
              <div className="space-y-1 text-left">
                <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block font-bold">Option 2</span>
                <span className="text-[11px] font-semibold text-[#EDE8DF] block">Flux AI Generation</span>
                <p className="text-[10px] text-[#8F8A82]/70 leading-relaxed">Create a premium atmospheric cover image directly with AI</p>
              </div>
              <div className="space-y-2">
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder={`Prompt (defaults to: A cinematic, atmospheric dark photo of ${story.title}...)`}
                  rows={2}
                  className="w-full bg-neutral-950 border border-neutral-850 rounded-lg p-2 text-xs text-[#EDE8DF] focus:outline-none focus:border-[#9E7B4C]/50 placeholder-neutral-600 resize-none font-sans"
                />
                <button
                  disabled={loading}
                  onClick={handleGenerateAiImage}
                  className="w-full py-2 bg-indigo-900/40 border border-indigo-500/25 hover:border-indigo-500/50 text-[#EDE8DF] text-[9px] font-mono font-bold tracking-widest uppercase rounded-lg hover:bg-indigo-900/70 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> {loading ? 'Generating image...' : 'Generate with Flux'}
                </button>
              </div>
            </div>
          </div>

          {/* 3. Link Remote URL */}
          <div className="p-4 bg-black/20 border border-neutral-900/60 rounded-xl space-y-3">
            <div className="space-y-1">
              <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block font-bold">Option 3</span>
              <span className="text-[11px] font-semibold text-[#EDE8DF] block">Web Image URL</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                placeholder="Paste remote image URL (https://...)"
                className="flex-1 bg-neutral-950 border border-neutral-850 rounded-lg px-3 py-1.5 text-xs text-[#EDE8DF] focus:outline-none focus:border-[#9E7B4C]/50 placeholder-neutral-600 font-mono"
              />
              <button
                disabled={loading || !remoteUrl.trim()}
                onClick={handleSaveRemoteUrl}
                className="px-4 py-1.5 bg-[#9E7B4C]/10 border border-[#9E7B4C]/30 text-[#EDE8DF] text-[9px] font-mono font-bold tracking-widest uppercase rounded-lg hover:bg-[#9E7B4C]/25 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <LinkIcon className="w-3 h-3" /> Save URL
              </button>
            </div>
          </div>
        </div>

        {/* Action Button: Publish to Live */}
        <div className="pt-4 border-t border-neutral-900/60 flex items-center justify-end gap-3">
          <span className="text-[9px] font-mono text-neutral-600">
            {hasThumbnail ? '✓ Ready for publication' : '⚠️ Requires cover thumbnail before going live'}
          </span>
          <button
            disabled={loading || !hasThumbnail}
            onClick={() => onPublish(story.story_id)}
            className={`px-6 py-2.5 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
              hasThumbnail 
                ? 'bg-emerald-800 hover:bg-emerald-700 text-white active:scale-95' 
                : 'bg-neutral-900 border border-neutral-800 text-neutral-600 cursor-not-allowed'
            }`}
          >
            <Check className="w-3.5 h-3.5" /> Go Live
          </button>
        </div>
      </div>
    </div>
  );
}
