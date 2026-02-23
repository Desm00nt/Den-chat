import { X, Download } from 'lucide-react';

interface ImagePreviewProps {
  src: string;
  onClose: () => void;
}

export function ImagePreview({ src, onClose }: ImagePreviewProps) {
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = src;
    link.download = `denchat-image-${Date.now()}.jpg`;
    link.click();
  };

  return (
    <div 
      className="fixed inset-0 z-[90] bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDownload();
          }}
          className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <Download className="w-6 h-6 text-white" />
        </button>
        <button
          onClick={onClose}
          className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="w-6 h-6 text-white" />
        </button>
      </div>

      {/* Image */}
      <img
        src={src}
        alt="Preview"
        className="max-w-full max-h-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
