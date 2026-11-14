import React, { useState, useMemo, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { InventoryTable } from './components/InventoryTable';
import { DataImport } from './components/DataImport';
import { ProductDetail } from './components/ProductDetail';
import { AdsAnalytics } from './components/AdsAnalytics';
import { CityDetail } from './components/CityDetail';
import { ReplenishmentPlanner } from './components/ReplenishmentPlanner';
import { ProfitAnalytics } from './components/ProfitAnalytics';
import { ActionAlerts } from './components/ActionAlerts';
import { 
  parseInventoryCSV, parseSalesCSV, parseAdsCSV, readFileAsText, readExcelAsCSV, readExcelAdsSheets, extractAdsSheetNames,
  mergeData, computeContentHash, extractDateRange, deduplicateSalesAcrossSheets, deduplicateAdsAcrossSheets
} from './utils';
import { 
  loadSourcesFromStorage, saveSourcesToStorage, clearSourcesStorage,
  loadProductCosts, saveProductCosts, loadGlobalProfitConfig, saveGlobalProfitConfig
} from './storage';
import { 
  InventoryRecord, SalesRecord, AdvertisementRecord, ViewMode, DataSource, FileType, 
  MergedItem, ProductCostConfig, GlobalProfitConfig 
} from './types';
import { RAW_CSV_DATA, RAW_SALES_DATA } from './constants';

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.DATA_IMPORT);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [deduplicateRows, setDeduplicateRows] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem('blinkit_deduplicate_rows');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [productCosts, setProductCosts] = useState<Record<string, ProductCostConfig>>(() => loadProductCosts());
  const [globalProfitConfig, setGlobalProfitConfig] = useState<GlobalProfitConfig>(() => loadGlobalProfitConfig());

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem('blinkit_dark_mode');
      if (savedTheme !== null) {
        setIsDarkMode(savedTheme === 'true');
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setIsDarkMode(true);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleToggleTheme = () => {
    setIsDarkMode(prev => {
      const next = !prev;
      try {
        window.localStorage.setItem('blinkit_dark_mode', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Load saved sheets from local IndexedDB storage on startup
  useEffect(() => {
    let mounted = true;
    const hydrate = async () => {
      try {
        const savedSources = await loadSourcesFromStorage();
        if (!mounted) return;
        if (savedSources.length > 0) {
          setSources(savedSources);
          if (savedSources.some(s => s.isActive)) {
            setViewMode(ViewMode.DASHBOARD);
          }
        }
      } catch (err) {
        console.error('Failed to load locally saved sheets:', err);
      } finally {
        if (mounted) {
          setHasHydrated(true);
          setLoading(false);
        }
      }
    };
    hydrate();
    return () => {
      mounted = false;
    };
  }, []);

  // Automatically persist changes to local IndexedDB storage
  useEffect(() => {
    if (!hasHydrated) return;
    saveSourcesToStorage(sources).catch(err => {
      console.error('Failed to persist sheets locally:', err);
    });
  }, [sources, hasHydrated]);

  const handleToggleDeduplicate = () => {
    setDeduplicateRows(prev => {
      const next = !prev;
      try {
        window.localStorage.setItem('blinkit_deduplicate_rows', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleUpdateProductCosts = (next: Record<string, ProductCostConfig>) => {
    setProductCosts(next);
    saveProductCosts(next);
  };

  const handleUpdateGlobalProfitConfig = (next: GlobalProfitConfig) => {
    setGlobalProfitConfig(next);
    saveGlobalProfitConfig(next);
  };

  // Derived active data sets
  const activeInventoryData = useMemo(() => {
    const invSource = sources.find(s => s.type === 'INVENTORY' && s.isActive);
    return (invSource?.parsedData as InventoryRecord[]) || [];
  }, [sources]);

  const salesAggregation = useMemo(() => {
    const activeSheets = sources
      .filter(s => s.type === 'SALES' && s.isActive)
      .map(s => (s.parsedData as SalesRecord[]) || []);
    if (!deduplicateRows || activeSheets.length <= 1) {
      return { records: activeSheets.flat(), removedCount: 0 };
    }
    return deduplicateSalesAcrossSheets(activeSheets);
  }, [sources, deduplicateRows]);

  const activeSalesData = salesAggregation.records;

  const adsAggregation = useMemo(() => {
    const activeSheets = sources
      .filter(s => s.type === 'ADVERTISEMENT' && s.isActive)
      .map(s => (s.parsedData as AdvertisementRecord[]) || []);
    if (!deduplicateRows || activeSheets.length <= 1) {
      return { records: activeSheets.flat(), removedCount: 0 };
    }
    return deduplicateAdsAcrossSheets(activeSheets);
  }, [sources, deduplicateRows]);

  const activeAdsData = adsAggregation.records;
  const totalRemovedDuplicateCount = salesAggregation.removedCount + adsAggregation.removedCount;

  // Derived merged data for dashboard
  const mergedData = useMemo(() => {
    if (activeInventoryData.length === 0 && activeSalesData.length === 0) return [];
    return mergeData(activeInventoryData, activeSalesData);
  }, [activeInventoryData, activeSalesData]);

  // Combined inventory data for table (includes sales counts from active sales reports)
  const inventoryWithSalesData = useMemo(() => {
    // We can use mergedData to get item-level summaries easily
    const itemMap = new Map<string, MergedItem>(mergedData.map(m => [m.itemId, m]));

    return activeInventoryData.map(inv => {
      const merged = itemMap.get(inv.itemId);
      const reportSalesQty = merged ? (merged.salesVelocity || 0) : 0;
      const reportSalesASP = merged ? (merged.avgSalesPrice || 0) : 0;
      
      // Calculate forecast for this specific warehouse line
      // Daily Sales * 45 - Current Warehouse Sellable
      const dailyS = reportSalesQty / 30;
      const req = Math.ceil(dailyS * 45);
      const forecast45d = Math.max(0, req - inv.totalSellable);

      return {
        ...inv,
        reportSalesQty,
        reportSalesASP,
        forecast45d
      };
    });
  }, [activeInventoryData, mergedData]);

  // Handler to open product detail
  const handleSelectProduct = (itemId: string) => {
    setSelectedItemId(itemId);
    setViewMode(ViewMode.PRODUCT_DETAIL);
  };

  // Handler to open city detail
  const handleSelectCity = (city: string) => {
    setSelectedCity(city);
    setViewMode(ViewMode.CITY_DETAIL);
  };

  const processFileContent = (content: string, type: FileType, fileName: string, sheetNames?: string[]) => {
    const fileHash = computeContentHash(content);
    if (type !== 'INVENTORY') {
      const duplicate = sources.find(s => s.type === type && (s.fileHash === fileHash || (s.rawContent && computeContentHash(s.rawContent) === fileHash)));
      if (duplicate) {
        throw new Error(`Duplicate Sheet Detected: "${fileName}" has identical data to already uploaded "${duplicate.fileName}".`);
      }
    }

    let records: (InventoryRecord | SalesRecord | AdvertisementRecord)[] = [];
    
    if (type === 'INVENTORY') {
      records = parseInventoryCSV(content);
    } else if (type === 'SALES') {
      records = parseSalesCSV(content);
    } else if (type === 'ADVERTISEMENT') {
      records = parseAdsCSV(content);
    }

    const dateRange =
      type === 'SALES' || type === 'ADVERTISEMENT'
        ? extractDateRange(records as (SalesRecord | AdvertisementRecord)[])
        : undefined;

    const detectedSheets =
      sheetNames || (type === 'ADVERTISEMENT' ? extractAdsSheetNames(content) : undefined);

    const newSource: DataSource = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type,
      fileName,
      uploadDate: Date.now(),
      isActive: true,
      rowCount: records.length,
      rawContent: content,
      parsedData: records,
      dateRange,
      fileHash,
      sheetNames: detectedSheets,
    };

    setSources(prev => {
      if (type === 'INVENTORY') {
        // Replace existing inventory
        return [...prev.filter(s => s.type !== 'INVENTORY'), newSource];
      } else {
        // Append new sales or ads report
        return [...prev, newSource];
      }
    });
  };

  const handleFileUpload = async (file: File, type: FileType) => {
    try {
      let content = '';
      let sheetNames: string[] | undefined;
      if (file.name.endsWith('.csv')) {
        content = await readFileAsText(file);
      } else if (file.name.match(/\.(xlsx|xls)$/i)) {
        if (type === 'ADVERTISEMENT') {
          const adsWorkbook = await readExcelAdsSheets(file);
          content = adsWorkbook.content;
          sheetNames = adsWorkbook.sheetNames;
        } else {
          content = await readExcelAsCSV(file);
        }
      } else {
        throw new Error("Unsupported file format. Please upload .csv, .xlsx, or .xls");
      }
      processFileContent(content, type, file.name, sheetNames);
    } catch (error: any) {
      console.error("File processing error:", error);
      throw error; 
    }
  };

  const handleBatchUpload = async (
    files: File[], 
    type: FileType,
    onProgress?: (current: number, total: number, fileName: string) => void
  ) => {
    const newSources: DataSource[] = [];
    const errors: string[] = [];
    const existingHashes = new Set(
      sources
        .filter(s => s.type === type)
        .map(s => s.fileHash || (s.rawContent ? computeContentHash(s.rawContent) : ''))
        .filter(Boolean)
    );

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (onProgress) {
        onProgress(i + 1, files.length, file.name);
      }
      try {
        let content = '';
        let sheetNames: string[] | undefined;
        if (file.name.endsWith('.csv')) {
          content = await readFileAsText(file);
        } else if (file.name.match(/\.(xlsx|xls)$/i)) {
          if (type === 'ADVERTISEMENT') {
            const adsWorkbook = await readExcelAdsSheets(file);
            content = adsWorkbook.content;
            sheetNames = adsWorkbook.sheetNames;
          } else {
            content = await readExcelAsCSV(file);
          }
        } else {
          throw new Error(`Unsupported format for ${file.name}. Use .csv or .xlsx`);
        }

        const fileHash = computeContentHash(content);
        if (type !== 'INVENTORY' && existingHashes.has(fileHash)) {
          errors.push(`${file.name}: Skipped (Exact duplicate already uploaded)`);
          continue;
        }
        existingHashes.add(fileHash);

        let records: (InventoryRecord | SalesRecord | AdvertisementRecord)[] = [];
        if (type === 'INVENTORY') {
          records = parseInventoryCSV(content);
        } else if (type === 'SALES') {
          records = parseSalesCSV(content);
        } else if (type === 'ADVERTISEMENT') {
          records = parseAdsCSV(content);
        }

        const dateRange =
          type === 'SALES' || type === 'ADVERTISEMENT'
            ? extractDateRange(records as (SalesRecord | AdvertisementRecord)[])
            : undefined;

        newSources.push({
          id: `${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`,
          type,
          fileName: file.name,
          uploadDate: Date.now(),
          isActive: true,
          rowCount: records.length,
          rawContent: content,
          parsedData: records,
          dateRange,
          fileHash,
          sheetNames,
        });
      } catch (err: any) {
        console.error(`Error processing ${file.name}:`, err);
        errors.push(`${file.name}: ${err.message || 'Failed to process'}`);
      }
    }

    if (newSources.length > 0) {
      setSources(prev => {
        if (type === 'INVENTORY') {
          return [...prev.filter(s => s.type !== 'INVENTORY'), ...newSources];
        } else {
          return [...prev, ...newSources];
        }
      });
    }

    if (errors.length > 0) {
      throw new Error(`Imported ${newSources.length} file(s). ${errors.length} skipped/failed:\n${errors.join('\n')}`);
    }
  };

  const handleRemoveAllByType = (type: FileType) => {
    setSources(prev => prev.filter(s => s.type !== type));
  };

  const handleLoadSample = () => {
    setLoading(true);
    setTimeout(() => {
      try {
        const demoInvId = 'demo-inventory';
        const demoSalesId = 'demo-sales';
        const invRecords = parseInventoryCSV(RAW_CSV_DATA);
        const salesRecords = parseSalesCSV(RAW_SALES_DATA);

        setSources(prev => {
          const cleanPrev = prev.filter(s => s.id !== demoInvId && s.id !== demoSalesId);
          return [
            ...cleanPrev,
            {
              id: demoInvId,
              type: 'INVENTORY',
              fileName: 'Demo_Inventory_Data.csv',
              uploadDate: Date.now(),
              isActive: true,
              rowCount: invRecords.length,
              rawContent: RAW_CSV_DATA,
              parsedData: invRecords
            },
            {
              id: demoSalesId,
              type: 'SALES',
              fileName: 'Demo_Monthly_Sales.csv',
              uploadDate: Date.now(),
              isActive: true,
              rowCount: salesRecords.length,
              rawContent: RAW_SALES_DATA,
              parsedData: salesRecords
            }
          ];
        });
        setViewMode(ViewMode.DASHBOARD);
      } catch (e) {
        console.error("Error loading sample data", e);
      } finally {
        setLoading(false);
      }
    }, 800);
  };

  const handleRefreshData = async () => {
    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 400));
      setSources(prev => prev.map(source => {
        if (!source.rawContent) return source;
        let records: any[] = [];
        if (source.type === 'INVENTORY') {
          records = parseInventoryCSV(source.rawContent);
        } else if (source.type === 'SALES') {
          records = parseSalesCSV(source.rawContent);
        } else if (source.type === 'ADVERTISEMENT') {
          records = parseAdsCSV(source.rawContent);
        }
        return {
          ...source,
          rowCount: records.length,
          parsedData: records,
          sheetNames: source.sheetNames || (source.type === 'ADVERTISEMENT' ? extractAdsSheetNames(source.rawContent) : undefined),
        };
      }));
    } catch (e) {
      console.error("Refresh failed", e);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveSource = (id: string) => {
    setSources(prev => prev.filter(s => s.id !== id));
  };

  const handleClearAllSources = async () => {
    setSources([]);
    await clearSourcesStorage();
  };

  const handleToggleSource = (id: string) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, isActive: !s.isActive } : s));
  };

  if (loading) {
    return (
      <div className={`h-screen w-full flex items-center justify-center ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
          <p className={`font-medium animate-pulse ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            {hasHydrated ? 'Processing Data...' : 'Loading Saved Reports...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <Layout currentMode={viewMode} setMode={setViewMode} isDarkMode={isDarkMode} toggleTheme={handleToggleTheme}>
      {viewMode === ViewMode.DASHBOARD && (
        sources.some(s => s.isActive) ? (
          <Dashboard 
            mergedData={mergedData} 
            rawInventory={activeInventoryData} 
            salesData={activeSalesData}
            adsData={activeAdsData}
            onSelectProduct={handleSelectProduct}
            onSelectCity={handleSelectCity}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-slate-500">
             <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 text-center max-w-md transition-colors">
                <p className="text-lg font-medium text-gray-800 dark:text-white mb-2">Ready to Analyze?</p>
                <p className="text-gray-500 dark:text-slate-400 mb-6">Upload your inventory and sales reports to see the insights.</p>
                <button 
                  onClick={() => setViewMode(ViewMode.DATA_IMPORT)} 
                  className="px-6 py-2 bg-yellow-400 text-slate-900 font-bold rounded-lg hover:bg-yellow-300 transition-colors"
                >
                  Go to Import
                </button>
             </div>
          </div>
        )
      )}

      {viewMode === ViewMode.INVENTORY_LIST && (
        <InventoryTable 
          data={inventoryWithSalesData} 
          onSelectProduct={handleSelectProduct}
        />
      )}

      {viewMode === ViewMode.REPLENISHMENT && (
        <ReplenishmentPlanner
          inventoryData={activeInventoryData}
          salesData={activeSalesData}
          onSelectProduct={handleSelectProduct}
        />
      )}

      {viewMode === ViewMode.PROFIT_ANALYTICS && (
        <ProfitAnalytics
          salesData={activeSalesData}
          inventoryData={activeInventoryData}
          adsData={activeAdsData}
          productCosts={productCosts}
          onUpdateProductCosts={handleUpdateProductCosts}
          globalConfig={globalProfitConfig}
          onUpdateGlobalConfig={handleUpdateGlobalProfitConfig}
          onSelectProduct={handleSelectProduct}
        />
      )}

      {viewMode === ViewMode.ACTION_ALERTS && (
        <ActionAlerts
          inventoryData={activeInventoryData}
          mergedData={mergedData}
          onSelectProduct={handleSelectProduct}
        />
      )}

      {viewMode === ViewMode.ADS_ANALYTICS && (
        activeAdsData.length > 0 ? (
          <AdsAnalytics data={activeAdsData} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-slate-500">
             <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 text-center max-w-md transition-colors">
                <p className="text-lg font-medium text-gray-800 dark:text-white mb-2">No Ad Data Found</p>
                <p className="text-gray-500 dark:text-slate-400 mb-6">Please upload your Blinkit Advertisement Report CSV/Excel files.</p>
                <button 
                  onClick={() => setViewMode(ViewMode.DATA_IMPORT)} 
                  className="px-6 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Upload Ads Report
                </button>
             </div>
          </div>
        )
      )}

      {viewMode === ViewMode.PRODUCT_DETAIL && selectedItemId && (
        <ProductDetail
          itemId={selectedItemId}
          mergedData={mergedData}
          rawInventory={activeInventoryData}
          salesData={activeSalesData}
          onBack={() => setViewMode(ViewMode.INVENTORY_LIST)}
          onSelectCity={handleSelectCity}
        />
      )}

      {viewMode === ViewMode.CITY_DETAIL && selectedCity && (
        <CityDetail
          cityName={selectedCity}
          salesData={activeSalesData}
          inventoryData={activeInventoryData}
          onBack={() => setViewMode(ViewMode.DASHBOARD)}
          onSelectProduct={handleSelectProduct}
        />
      )}

      {viewMode === ViewMode.DATA_IMPORT && (
        <DataImport 
          sources={sources} 
          onUpload={handleFileUpload} 
          onBatchUpload={handleBatchUpload}
          onRemove={handleRemoveSource}
          onRemoveAllByType={handleRemoveAllByType}
          onClearAll={handleClearAllSources}
          onToggle={handleToggleSource}
          onLoadSample={handleLoadSample}
          onRefresh={handleRefreshData}
          deduplicateRows={deduplicateRows}
          onToggleDeduplicate={handleToggleDeduplicate}
          removedDuplicateCount={totalRemovedDuplicateCount}
        />
      )}
    </Layout>
  );
};

export default App;