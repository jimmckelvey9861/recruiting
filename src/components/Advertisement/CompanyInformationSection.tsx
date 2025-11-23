import React, { useState, useRef } from 'react';
import MobilePreview from '../MobilePreview';

const Card: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="bg-white border rounded-xl p-5 shadow-sm">
    <div className="flex items-center gap-3 mb-4">
      <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">{icon ?? '⬚'}</div>
      <h2 className="text-base font-semibold">{title}</h2>
    </div>
    <div className="grid grid-cols-12 gap-3">{children}</div>
  </div>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="block text-[13px] text-gray-700 mb-1">{children}</label>
);

const Field: React.FC<{ span?: string; children: React.ReactNode; label?: string }> = ({ span = "col-span-12 sm:col-span-6 lg:col-span-4", children, label }) => (
  <div className={span}>
    {label ? <Label>{label}</Label> : null}
    {children}
  </div>
);

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={"w-full h-9 px-2 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 " + (props.className || "")} />
);

const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} className={"w-full min-h-[72px] px-2 py-1 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 " + (props.className || "")} />
);

const Chip: React.FC<{ onRemove?: () => void; children: React.ReactNode }> = ({ onRemove, children }) => (
  <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 rounded-full px-2 h-7 text-xs">
    {children}
    {onRemove && (
      <button type="button" onClick={onRemove} className="w-4 h-4 grid place-items-center rounded-full hover:bg-red-100 text-red-600">×</button>
    )}
  </span>
);

export default function CompanyInformationSection() {
  const [culture, setCulture] = useState(["Collaborative", "Fast-paced"]);
  const [newTag, setNewTag] = useState("");
  const [images, setImages] = useState<(string | null)[]>([null, null, null, null]);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [editingImageIdx, setEditingImageIdx] = useState<number | null>(null);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [welcomeVideo, setWelcomeVideo] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [showVideoEditor, setShowVideoEditor] = useState(false);
  const [videoTrim, setVideoTrim] = useState<{ start: number; end: number } | null>(null);
  const [showLogoEditor, setShowLogoEditor] = useState(false);
  const [logoZoom, setLogoZoom] = useState(1);
  const [logoPan, setLogoPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setCompanyLogo(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setWelcomeVideo(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleLogoDoubleClick = () => {
    setShowLogoEditor(true);
  };

  const handleZoomIn = () => setLogoZoom(prev => Math.min(prev + 0.1, 3));
  const handleZoomOut = () => setLogoZoom(prev => Math.max(prev - 0.1, 0.5));
  
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - logoPan.x, y: e.clientY - logoPan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setLogoPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetLogoEditor = () => {
    setLogoZoom(1);
    setLogoPan({ x: 0, y: 0 });
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOver(index);
  };

  const handleDragLeave = () => {
    setDragOver(null);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        setImages(prev => {
          const newImages = [...prev];
          newImages[index] = reader.result as string;
          return newImages;
        });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <>
      <div className="flex gap-6">
        {/* Left rail: Mobile Preview + Previous Postings scroll together */}
        <div className="flex-shrink-0">
          <MobilePreview />
          {/* Previous Postings (compact) */}
          <div className="mt-4 bg-white border rounded-xl p-3 shadow-sm w-[210px]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-700">Previous Postings</h3>
              <button
                type="button"
                className="text-[11px] text-blue-600 hover:underline"
                onClick={() => window.dispatchEvent(new CustomEvent('passcom-save-posting'))}
                title="Save current fields as a reusable posting"
              >
                Save
              </button>
            </div>
            <PostingList />
          </div>
        </div>
        
        {/* Form Content */}
        <div className="flex-1">
          <Card title="Company Information" icon={<span>🏢</span>}>
        <Field span="col-span-12 lg:col-span-6" label="Company Name">
          <Input placeholder="e.g., TechCorp Solutions" defaultValue="TechCorp Solutions" />
        </Field>

        <Field span="col-span-12 lg:col-span-6" label="Company Website">
          <Input placeholder="https://www.example.com" type="url" />
        </Field>

        <Field span="col-span-12" label="">
          <div className="flex gap-6 items-start">
            {/* Logo */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[13px] text-gray-700">Logo</span>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="text-blue-600 hover:underline text-sm"
                >
                  Upload
                </button>
              </div>
              {companyLogo ? (
                <div
                  className="relative w-24 h-24 border rounded-lg overflow-hidden bg-white cursor-pointer hover:border-blue-400"
                  onDoubleClick={handleLogoDoubleClick}
                  title="Double-click to adjust position and zoom"
                >
                  <img src={companyLogo} alt="Company Logo" className="w-full h-full object-contain" />
                  <button
                    type="button"
                    onClick={() => setCompanyLogo(null)}
                    className="absolute top-1 right-1 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center hover:bg-red-700 z-10"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400">
                  <span className="text-2xl">🏢</span>
                </div>
              )}
            </div>

            {/* Welcome Video */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[13px] text-gray-700">Welcome Video</span>
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleVideoUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="text-blue-600 hover:underline text-sm"
                >
                  Upload
                </button>
                {welcomeVideo && (
                  <>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={() => setWelcomeVideo(null)}
                      className="text-red-600 hover:underline text-sm"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
              {welcomeVideo ? (
                <div className="border rounded-lg overflow-hidden bg-black cursor-pointer" style={{ width: '192px', height: '96px' }} onClick={() => setShowVideoEditor(true)} title="Click to edit">
                  <video
                    src={welcomeVideo}
                    controls
                    className="w-full h-full object-cover"
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400" style={{ width: '192px', height: '96px' }}>
                  <div className="text-center">
                    <div className="text-2xl mb-1">🎥</div>
                    <div className="text-xs">No video</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Field>

        <Field span="col-span-12 lg:col-span-8" label="Company Description">
          <Textarea placeholder="Tell applicants about your company…" defaultValue="We are a growing hospitality group operating two high‑volume concepts." />
        </Field>
        <Field span="col-span-12 lg:col-span-4" label="Culture Tags">
          <div className="flex flex-wrap gap-2 mb-2">
            {culture.map((t, i) => <Chip key={i} onRemove={() => setCulture(prev => prev.filter((_, j) => j !== i))}>{t}</Chip>)}
          </div>
          <Input placeholder="Innovative" value={newTag}
            onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newTag.trim()) { setCulture(p => [...p, newTag.trim()]); setNewTag(""); e.preventDefault(); } }}
          />
        </Field>

        <Field span="col-span-12" label="Company Images">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))' }}>
            {images.map((img, i) => (
              <div
                key={i}
                onDragOver={(e) => handleDragOver(e, i)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, i)}
                className={`aspect-square rounded-lg overflow-hidden border-2 grid place-items-center transition-all ${dragOver === i
                    ? 'border-blue-500 bg-blue-50'
                    : img
                      ? 'border-gray-200'
                      : 'border-dashed border-gray-300 bg-gray-100'
                  }`}
              >
                {img ? (
                  <img
                    src={img}
                    alt={`Upload ${i + 1}`}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setEditingImageIdx(i)}
                    title="Click to edit"
                  />
                ) : (
                  <div className="text-center text-gray-400 p-2">
                    <div className="text-2xl mb-1">📷</div>
                    <div className="text-xs">Drop image here</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Field>
      </Card>
        </div>
      </div>

      {/* Logo Editor Modal */}
      {showLogoEditor && companyLogo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Adjust Logo</h3>
            <div
              className="relative w-full h-64 border rounded-lg overflow-hidden bg-gray-100 mb-4"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            >
              <img
                src={companyLogo}
                alt="Logo"
                style={{
                  transform: `scale(${logoZoom}) translate(${logoPan.x / logoZoom}px, ${logoPan.y / logoZoom}px)`,
                  transformOrigin: 'center',
                  transition: isDragging ? 'none' : 'transform 0.1s'
                }}
                className="w-full h-full object-contain select-none"
                draggable={false}
              />
            </div>
            <div className="flex items-center gap-4 mb-4">
              <button onClick={handleZoomOut} className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">−</button>
              <span className="flex-1 text-center text-sm text-gray-600">Zoom: {(logoZoom * 100).toFixed(0)}%</span>
              <button onClick={handleZoomIn} className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">+</button>
            </div>
            <div className="flex gap-2">
              <button onClick={resetLogoEditor} className="px-4 py-2 border rounded hover:bg-gray-50">Reset</button>
              <button onClick={() => setShowLogoEditor(false)} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex-1">Done</button>
            </div>
          </div>
        </div>
      )}
      {/* Image Crop Editor */}
      {editingImageIdx != null && images[editingImageIdx] && (
        <ImageEditorModal
          src={images[editingImageIdx] as string}
          onCancel={()=> setEditingImageIdx(null)}
          onApply={(dataUrl)=> {
            setImages(prev => {
              const next = [...prev];
              next[editingImageIdx!] = dataUrl;
              return next;
            });
            setEditingImageIdx(null);
          }}
        />
      )}
      {/* Video Trim Editor */}
      {showVideoEditor && welcomeVideo && (
        <VideoEditorModal
          src={welcomeVideo}
          onCancel={()=> setShowVideoEditor(false)}
          onApply={({ start, end }) => {
            setVideoTrim({ start, end });
            setShowVideoEditor(false);
          }}
        />
      )}
    </>
  );
}

function PostingList() {
  const [items, setItems] = React.useState<{ postingName: string }[]>([]);
  const reload = React.useCallback(() => {
    try {
      const raw = localStorage.getItem('passcom-postings');
      const list = raw ? JSON.parse(raw) : [];
      setItems(list);
    } catch {
      setItems([]);
    }
  }, []);
  React.useEffect(() => {
    reload();
    const onUpd = () => reload();
    window.addEventListener('passcom-postings-updated', onUpd);
    window.addEventListener('storage', onUpd as any);
    return () => {
      window.removeEventListener('passcom-postings-updated', onUpd);
      window.removeEventListener('storage', onUpd as any);
    };
  }, [reload]);
  const loadPosting = (name: string) => {
    try {
      const raw = localStorage.getItem('passcom-postings');
      const list = raw ? JSON.parse(raw) : [];
      const found = list.find((p: any) => p.postingName === name);
      if (found) {
        window.dispatchEvent(new CustomEvent('passcom-load-posting', { detail: found }));
      }
    } catch {}
  };
  const removePosting = (name: string) => {
    try {
      const raw = localStorage.getItem('passcom-postings');
      const list = raw ? JSON.parse(raw) : [];
      const next = list.filter((p: any) => p.postingName !== name);
      localStorage.setItem('passcom-postings', JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('passcom-postings-updated'));
    } catch {}
  };
  if (!items.length) {
    return <div className="text-[11px] text-gray-500">No saved postings</div>;
  }
  return (
    <div className="space-y-2 max-h-[220px] overflow-auto">
      {items.map((it) => (
        <div key={it.postingName} className="flex items-center gap-2 justify-between border rounded px-2 py-1">
          <div className="text-[11px] text-gray-700 truncate max-w-[120px]" title={it.postingName}>{it.postingName}</div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="text-[11px] text-blue-600 hover:underline"
              onClick={() => loadPosting(it.postingName)}
            >
              Use
            </button>
            <button
              type="button"
              className="text-[11px] text-gray-500 hover:underline"
              onClick={() => removePosting(it.postingName)}
              title="Remove"
            >
              Del
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ------- Simple Image Editor (pan/zoom + square crop) -------
function ImageEditorModal({ src, onCancel, onApply }: { src: string; onCancel: ()=>void; onApply: (dataUrl: string)=>void }) {
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [drag, setDrag] = React.useState(false);
  const startRef = React.useRef({ x: 0, y: 0 });
  const onMouseDown = (e: React.MouseEvent) => {
    setDrag(true);
    startRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag) return;
    setPan({ x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y });
  };
  const onMouseUp = () => setDrag(false);
  const apply = async () => {
    const img = new Image();
    img.src = src;
    await new Promise(res => { img.onload = res; });
    const size = 300;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,size,size);
    const iw = img.width * zoom;
    const ih = img.height * zoom;
    const cx = size/2 + pan.x;
    const cy = size/2 + pan.y;
    const dx = cx - iw/2;
    const dy = cy - ih/2;
    ctx.drawImage(img, dx, dy, iw, ih);
    onApply(canvas.toDataURL('image/jpeg', 0.9));
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-4 w-[420px]">
        <h3 className="text-sm font-semibold mb-2">Crop Image</h3>
        <div
          className="relative border rounded overflow-hidden bg-gray-100 mx-auto"
          style={{ width: 300, height: 300, cursor: drag ? 'grabbing' : 'grab' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <img
            src={src}
            alt="edit"
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center',
              userSelect: 'none',
              pointerEvents: 'none'
            }}
          />
        </div>
        <div className="flex items-center gap-3 mt-3">
          <span className="text-xs text-gray-600 w-12">Zoom</span>
          <input type="range" min={0.5} max={3} step={0.05} value={zoom} onChange={(e)=> setZoom(Number(e.target.value))} className="flex-1"/>
          <span className="text-xs text-gray-600 w-10 text-right">{Math.round(zoom*100)}%</span>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button className="px-3 py-1 border rounded text-sm" onClick={onCancel}>Cancel</button>
          <button className="px-3 py-1 bg-blue-600 text-white rounded text-sm" onClick={apply}>Save Crop</button>
        </div>
      </div>
    </div>
  );
}

// ------- Simple Video Trim Modal -------
function VideoEditorModal({ src, onCancel, onApply }: { src: string; onCancel: ()=>void; onApply: (r:{start:number,end:number})=>void }) {
  const videoRef = React.useRef<HTMLVideoElement|null>(null);
  const [start, setStart] = React.useState(0);
  const [end, setEnd] = React.useState(0);
  const onLoaded = () => {
    const d = videoRef.current?.duration || 0;
    setEnd(Math.floor(d));
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-4 w-[520px]">
        <h3 className="text-sm font-semibold mb-2">Edit Video</h3>
        <video ref={videoRef} src={src} controls onLoadedMetadata={onLoaded} className="w-full bg-black rounded" />
        <div className="mt-3 grid grid-cols-2 gap-3 items-center">
          <label className="text-xs text-gray-600">Start (s)</label>
          <input className="border rounded px-2 h-8" type="number" value={start} min={0} max={Math.max(0,end-1)} onChange={(e)=> setStart(Number(e.target.value))}/>
          <label className="text-xs text-gray-600">End (s)</label>
          <input className="border rounded px-2 h-8" type="number" value={end} min={start+1} onChange={(e)=> setEnd(Number(e.target.value))}/>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button className="px-3 py-1 border rounded text-sm" onClick={onCancel}>Cancel</button>
          <button className="px-3 py-1 bg-blue-600 text-white rounded text-sm" onClick={()=> onApply({ start, end })}>Save</button>
        </div>
      </div>
    </div>
  );
}
