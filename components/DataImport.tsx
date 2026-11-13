import React, { useState, useRef } from 'react';
import { 
  Upload, FileText, Trash2, Eye, EyeOff, CheckCircle, 
  FileSpreadsheet, AlertCircle, X, RefreshCw, Plus, Megaphone, 
  Files, Layers, Check
} from 'lucide-react';
import { DataSource, FileType } from '../types';

interface DataImportProps {
  sources: DataSource[];
  onUpload: (file: File, type: FileType) => Promise<void>;
  onBatchUpload?: (files: File[], type: FileType, onProgress?: (current: number, total: number, fileName: string) => void) => Promise<void>;
  onRemove: (id: string) => void;
  onRemoveAllByType?: (type: FileType) => void;
  onClearAll?: () => void;
  onToggle: (id: string) => void;
  onLoadSample: () => void;
  onRefresh: () => void;
}

export const DataImport: React.FC<DataImportProps> = ({ 
  sources, 
  onUpload, 
  onBatchUpload,
  onRemove, 
  onRemoveAllByType,
  onClearAll,
  onToggle, 
  onLoadSample, 
  onRefresh 
}) => {
  const [uploadingType, setUploadingType] = useState<FileType | null>(null);
  const [error, setError] = useState<{ type: FileType; message: string } | null>(null);
  const [successMessage, setSuccessMessage] = useState<{ type: FileType; message: string } | null>(null);
  const [dragOverType, setDragOverType] = useState<FileType | null>(null);
  const [confirmClearType, setConfirmClearType] = useState<FileType | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
    percent: number;
  } | null>(null);

  const fileInputRefs = {
    INVENTORY: useRef<HTMLInputElement>(null),
    SALES: useRef<HTMLInputElement>(null),
    ADVERTISEMENT: useRef<HTMLInputElement>(null)
  };

  const handleFilesSelected = async (filesList: FileList | File[], type: FileType) => {
    const files = Array.from(filesList);
    if (!files || files.length === 0) return;

    setUploadingType(type);
    setError(null);
    setSuccessMessage(null);

    try {
      if (files.length > 1 && onBatchUpload) {
        setBatchProgress({
          current: 1,
          total: files.length,
          fileName: files[0].name,
          percent: 10
        });

        await onBatchUpload(files, type, (current, total, fileName) => {
          setBatchProgress({
            current,
            total,
            fileName,
            percent: Math.round((current / total) * 100)
          });
        });

        setSuccessMessage({
          type,
          message: `Successfully imported all ${files.length} sheets!`
        });
      } else {
        // Single file processing
        setBatchProgress({
          current: 1,
          total: 1,
          fileName: files[0].name,
          percent: 50
        });
        await onUpload(files[0], type);
        setBatchProgress({
          current: 1,
          total: 1,
          fileName: files[0].name,
          percent: 100
        });
        setSuccessMessage({
          type,
          message: `Successfully uploaded ${files[0].name}`
        });
      }
    } catch (err: any) {
      setError({ type, message: err.message || "Failed to process file(s)." });
    } finally {
      setTimeout(() => {
        setUploadingType(null);
        setBatchProgress(null);
      }, 600);
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: FileType) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelected(e.target.files, type);
      e.target.value = ''; // Reset so the same files can be re-selected if needed
    }
  };

  const handleDragOver = (e: React.DragEvent, type: FileType) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverType(type);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverType(null);
  };

  const handleDrop = (e: React.DragEvent, type: FileType) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverType(null);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files, type);
    }
  };

  const UploadCard = ({ 
    type, 
    title, 
    description, 
    allowedExts, 
    multiple, 
    icon: Icon 
  }: { 
    type: FileType; 
    title: string; 
    description: string; 
    allowedExts: string; 
    multiple: boolean; 
    icon: any; 
  }) => {
    const existingFiles = sources.filter(s => s.type === type);
    const isUploading = uploadingType === type;
    const hasError = error?.type === type;
    const hasSuccess = successMessage?.type === type;
    const isDragging = dragOverType === type;
    const totalRows = existingFiles.reduce((acc, f) => acc + (f.rowCount || 0), 0);

    return (
      <div 
        onDragOver={(e) => handleDragOver(e, type)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, type)}
        className={`flex flex-col h-full p-6 rounded-xl border-2 transition-all relative overflow-hidden ${
          isDragging 
            ? 'border-yellow-400 bg-yellow-50/50 dark:bg-yellow-900/20 scale-[1.01] shadow-lg ring-2 ring-yellow-400'
            : existingFiles.length > 0
              ? 'border-green-200 bg-green-50/30 dark:bg-green-900/10 dark:border-green-800' 
              : hasError 
                ? 'border-red-200 bg-red-50/30 dark:bg-red-900/10 dark:border-red-800' 
                : 'border-dashed border-gray-200 hover:border-yellow-400 bg-white dark:bg-slate-800 dark:border-slate-700 dark:hover:border-yellow-500 shadow-sm'
        }`}
      >
        {/* Loading Overlay */}
        {isUploading && (
          <div className="absolute inset-0 bg-white/95 dark:bg-slate-800/95 z-30 flex flex-col items-center justify-center p-6 text-center animate-in fade-in">
            <div className="w-full max-w-[240px] h-2.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden mb-3 shadow-inner">
              <div 
                className="h-full bg-yellow-400 transition-all duration-300 ease-out"
                style={{ width: `${batchProgress?.percent || 50}%` }}
              />
            </div>
            <p className="text-sm font-bold text-gray-800 dark:text-gray-100">
              {batchProgress?.total && batchProgress.total > 1
                ? `Importing Sheet ${batchProgress.current} of ${batchProgress.total}...`
                : 'Processing File...'}
            </p>
            {batchProgress?.fileName && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-[220px] truncate" title={batchProgress.fileName}>
                {batchProgress.fileName}
              </p>
            )}
            <div className="flex items-center gap-1.5 mt-2 text-xs font-semibold text-yellow-600 dark:text-yellow-400">
              <Layers className="w-3.5 h-3.5 animate-spin" />
              <span>Parsing Blinkit records...</span>
            </div>
          </div>
        )}

        {/* Dragging overlay indicator */}
        {isDragging && (
          <div className="absolute inset-0 bg-yellow-400/10 dark:bg-yellow-400/20 z-20 flex flex-col items-center justify-center pointer-events-none border-2 border-dashed border-yellow-500 rounded-xl">
            <Upload className="w-10 h-10 text-yellow-600 dark:text-yellow-400 animate-bounce mb-2" />
            <p className="text-sm font-bold text-yellow-800 dark:text-yellow-300">
              Drop {multiple ? 'sheets' : 'file'} here to upload
            </p>
          </div>
        )}

        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
             <div className={`p-3 rounded-xl ${
               existingFiles.length > 0 
                ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' 
                : hasError 
                  ? 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400' 
                  : 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
             }`}>
               {existingFiles.length > 0 ? <CheckCircle className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
             </div>
             <div>
               <div className="flex items-center gap-2">
                 <h3 className="font-bold text-gray-900 dark:text-gray-100">{title}</h3>
                 {multiple && (
                   <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-[10px] font-bold rounded-full">
                     Multi-Sheet
                   </span>
                 )}
               </div>
               <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs mt-0.5">{description}</p>
             </div>
          </div>
        </div>

        {/* Success Alert */}
        {hasSuccess && (
          <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 animate-in fade-in">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage.message}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Error Alert */}
        {hasError && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2 text-xs text-red-700 dark:text-red-300 animate-in slide-in-from-top-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">Upload Notice</p>
              <p className="mt-0.5 whitespace-pre-line">{error.message}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 dark:hover:text-red-300">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Header summary of uploaded files */}
        {existingFiles.length > 0 && (
          <div className="mb-3 px-3 py-2 bg-white/70 dark:bg-slate-900/40 rounded-lg border border-gray-100 dark:border-slate-700 flex justify-between items-center text-xs">
            <span className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <Files className="w-3.5 h-3.5 text-blue-500" />
              {existingFiles.length} {existingFiles.length === 1 ? 'Sheet' : 'Sheets'} Active
              <span className="text-gray-400 font-normal">({totalRows.toLocaleString()} rows)</span>
            </span>
            {multiple && onRemoveAllByType && existingFiles.length > 1 && (
              confirmClearType === type ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      onRemoveAllByType(type);
                      setConfirmClearType(null);
                    }}
                    className="text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmClearType(null)}
                    className="text-[11px] text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => setConfirmClearType(type)}
                  className="text-[11px] text-red-500 hover:text-red-700 hover:underline flex items-center gap-1"
                  title="Remove all uploaded sheets of this category"
                >
                  Clear All
                </button>
              )
            )}
          </div>
        )}

        {/* List of uploaded files */}
        <div className="flex-1 space-y-2 mb-4 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
          {existingFiles.map(file => (
            <div key={file.id} className="p-2.5 bg-white/80 dark:bg-slate-900/60 rounded-lg border border-gray-100 dark:border-slate-700/60 flex justify-between items-center group transition-colors">
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <span className={`font-medium text-xs truncate max-w-[170px] ${!file.isActive ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-200'}`} title={file.fileName}>
                    {file.fileName}
                  </span>
                  {!file.isActive && <span className="text-[10px] text-red-500 font-medium px-1 bg-red-50 dark:bg-red-900/30 rounded">(Hidden)</span>}
                </div>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                   {file.rowCount.toLocaleString()} rows • {new Date(file.uploadDate).toLocaleDateString([], { day: '2-digit', month: 'short' })}, {new Date(file.uploadDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                 <button 
                    onClick={() => onToggle(file.id)}
                    className="p-1 text-gray-400 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                    title={file.isActive ? "Hide Data" : "Show Data"}
                  >
                    {file.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                 </button>
                 <button 
                    onClick={() => onRemove(file.id)}
                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                    title="Remove File"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                 </button>
              </div>
            </div>
          ))}
        </div>

        {/* Upload Action Area */}
        <div className="mt-auto space-y-2">
          {multiple && (
            <div className="text-[11px] text-center text-slate-500 dark:text-slate-400 font-medium">
              💡 Tip: Select multiple sheets together in file dialog (Ctrl/Shift + Click)
            </div>
          )}

          <label className={`flex items-center justify-center w-full px-4 py-3 border border-gray-200 dark:border-slate-600 rounded-xl shadow-sm cursor-pointer transition-all duration-200 group ${
            multiple && existingFiles.length > 0 
              ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700 hover:bg-yellow-100 dark:hover:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 font-medium' 
              : 'bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200'
          }`}>
            {multiple && existingFiles.length > 0 ? (
               <Plus className="w-4 h-4 mr-2 text-yellow-600 dark:text-yellow-400 group-hover:scale-110 transition-transform" />
            ) : multiple ? (
               <Files className="w-4 h-4 mr-2 text-yellow-600 dark:text-yellow-400 group-hover:scale-110 transition-transform" />
            ) : (
               <Upload className="w-4 h-4 mr-2 text-gray-500 dark:text-gray-300 group-hover:text-yellow-500 transition-colors" />
            )}
            <span className="text-xs font-semibold">
              {multiple && existingFiles.length > 0 
                ? "Upload More Sheets (Batch Select)" 
                : multiple 
                  ? "Select Sheets (Upload Multiple at Once)" 
                  : `Upload ${allowedExts}`}
            </span>
            <input 
              ref={fileInputRefs[type]}
              type="file" 
              multiple={multiple}
              className="hidden" 
              accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
              onChange={(e) => handleFileChange(e, type)} 
            />
          </label>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Data Management Hub</h2>
            <span className="px-2.5 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 text-xs font-bold border border-yellow-200 dark:border-yellow-700/50">
              Batch Upload Enabled
            </span>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Upload single or multiple Blinkit reports (Inventory, Sales & Ads). All uploaded sheets are automatically saved locally in your browser.
          </p>
        </div>
        {sources.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <button 
              onClick={onRefresh}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 rounded-lg transition-colors text-sm font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh All Data
            </button>
            {onClearAll && (
              confirmClearAll ? (
                <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/40 px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-800">
                  <button
                    onClick={() => {
                      onClearAll();
                      setConfirmClearAll(false);
                    }}
                    className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold transition-colors"
                  >
                    Confirm Clear
                  </button>
                  <button
                    onClick={() => setConfirmClearAll(false)}
                    className="px-2 py-1 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClearAll(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-lg transition-colors text-sm font-medium"
                  title="Remove all saved sheets from local storage"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear Saved
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* Multi-file batch upload banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-5 text-white shadow-md border border-indigo-700/40 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm">
            <Files className="w-7 h-7 text-yellow-400" />
          </div>
          <div>
            <h3 className="font-bold text-base text-white">Ek Sath Multiple Sheets Upload Karein</h3>
            <p className="text-xs text-indigo-200 mt-0.5 max-w-xl">
              Sales aur Ads card par click karte hi aap keyboard pe <span className="text-yellow-400 font-bold">Ctrl / Shift</span> dabakar ek sath 10, 20 ya saari sheets select karke ek click mai upload kar sakte hain. Drag & drop bhi supported hai!
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => fileInputRefs.SALES.current?.click()}
            className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-slate-900 text-xs font-bold rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Select Sales Sheets
          </button>
          <button
            onClick={() => fileInputRefs.ADVERTISEMENT.current?.click()}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Select Ads Sheets
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <UploadCard 
          type="INVENTORY" 
          title="Warehouse Stock" 
          description="Blinkit Inventory sheet with darkstore & warehouse stock levels."
          allowedExts="CSV or Excel"
          multiple={false}
          icon={FileSpreadsheet}
        />
        <UploadCard 
          type="SALES" 
          title="Sales Reports" 
          description="Weekly, monthly or daily sales sheets. Select multiple files at once!"
          allowedExts="Multiple CSV / Excel"
          multiple={true}
          icon={FileText}
        />
        <UploadCard 
          type="ADVERTISEMENT" 
          title="Ads Reports" 
          description="Blinkit Advertising Campaign Reports. Select multiple files at once!"
          allowedExts="Multiple CSV / Excel"
          multiple={true}
          icon={Megaphone}
        />
      </div>

      <div className="pt-6 border-t border-gray-200 dark:border-slate-800">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-6 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
          <div>
            <h3 className="font-bold text-lg">Don't have real Blinkit files handy?</h3>
            <p className="text-slate-300 text-sm mt-1">Load multi-city sample seller data with inventory & sales to test the analytics engine.</p>
          </div>
          <button 
            onClick={onLoadSample}
            className="px-6 py-2.5 bg-yellow-400 text-slate-900 font-bold rounded-lg hover:bg-yellow-300 transition-colors shadow-lg hover:shadow-yellow-400/20 shrink-0 text-sm"
          >
            Load Demo Data
          </button>
        </div>
      </div>

      {sources.length === 0 && (
         <div className="text-center py-10 text-gray-400 dark:text-slate-600">
            <div className="mb-3">
               <FileText className="w-12 h-12 mx-auto opacity-20" />
            </div>
            <p className="text-sm">No data sources active. Please upload sheets or load demo data to view analytics.</p>
         </div>
      )}
    </div>
  );
};