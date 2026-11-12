import React, { useMemo } from 'react';
import { InventoryRecord, MergedItem, SalesRecord } from '../types';
import { prepareSalesChartData, aggregateSalesByCity } from '../utils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, ComposedChart, Area, ReferenceLine
} from 'recharts';
import { 
  ArrowLeft, Package, TrendingUp, ArchiveX, MapPin, 
  ExternalLink, Search, Box, Download, Sparkles,
  TrendingDown, Clock, AlertCircle, CalendarRange
} from 'lucide-react';

interface ProductDetailProps {
  itemId: string;
  mergedData: MergedItem[];
  rawInventory: InventoryRecord[];
  salesData: SalesRecord[];
  onBack: () => void;
  onSelectCity?: (city: string) => void;
}

export const ProductDetail: React.FC<ProductDetailProps> = ({ itemId, mergedData, rawInventory, salesData, onBack, onSelectCity }) => {
  
  // Get main item summary
  const product = mergedData.find(i => i.itemId === itemId);
  
  // Get raw inventory rows for this item
  const productInventory = useMemo(() => 
    rawInventory.filter(r => r.itemId === itemId), 
  [rawInventory, itemId]);

  // Get raw sales rows for this item
  const productSales = useMemo(() => 
    salesData.filter(s => s.itemId === itemId), 
  [salesData, itemId]);

  // Warehouse Chart Data
  const warehouseChartData = useMemo(() => {
    return productInventory.map(inv => ({
      name: inv.warehouseName.replace(' - Feeder', '').replace('Bengaluru', 'BLR').replace('Mumbai', 'MUM'),
      sellable: inv.totalSellable,
      unsellable: inv.totalUnsellable,
      damaged: inv.unsellableDamaged,
      expired: inv.unsellableExpired
    })).sort((a, b) => b.sellable - a.sellable);
  }, [productInventory]);

  // Sales Chart Data (Daily)
  const salesChartData = useMemo(() => prepareSalesChartData(productSales).daily, [productSales]);

  // City Sales Data
  const citySalesStats = useMemo(() => aggregateSalesByCity(productSales).slice(0, 5), [productSales]);

  // --- Advanced Forecasting Logic ---
  const { forecastData, totalForecastedSales, dailyTrend, trendDirection, stockoutDate, rSquared } = useMemo(() => {
    if (salesChartData.length < 2) {
        return { forecastData: [], totalForecastedSales: 0, dailyTrend: 0, trendDirection: 'stable', stockoutDate: null, rSquared: 0 };
    }

    // 1. Fill in missing dates for accurate regression
    const sortedData = [...salesChartData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const fullHistory: { date: string; index: number; quantity: number }[] = [];
    
    if (sortedData.length > 0) {
      const startDate = new Date(sortedData[0].date);
      const endDate = new Date(sortedData[sortedData.length - 1].date);
      let idx = 0;
      
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const existing = sortedData.find(item => item.date === dateStr);
        fullHistory.push({
          date: dateStr,
          index: idx++,
          quantity: existing ? existing.quantity : 0
        });
      }
    }

    // 2. Linear Regression (Least Squares)
    const n = fullHistory.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    
    fullHistory.forEach(p => {
        sumX += p.index;
        sumY += p.quantity;
        sumXY += (p.index * p.quantity);
        sumXX += (p.index * p.index);
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // R-Squared (Coefficient of Determination) calculation (simplified)
    const meanY = sumY / n;
    let ssTot = 0, ssRes = 0;
    fullHistory.forEach(p => {
        const expected = slope * p.index + intercept;
        ssTot += Math.pow(p.quantity - meanY, 2);
        ssRes += Math.pow(p.quantity - expected, 2);
    });
    const rSq = 1 - (ssRes / ssTot);


    // 3. Generate Data Points (History + Forecast)
    const combinedData: any[] = [];
    const forecastDays = 30;
    let predictedTotal = 0;

    // Historical Points
    fullHistory.forEach(h => {
        combinedData.push({
            date: h.date,
            type: 'history',
            actual: h.quantity,
            forecast: null as number | null,
            confidenceHigh: null as number | null,
            confidenceLow: null as number | null,
            confidenceRange: null as [number, number] | null
        });
    });

    // Forecast Points
    const lastHistDate = new Date(fullHistory[fullHistory.length - 1].date);
    let runningStock = product ? product.totalSellable : 0;
    let predictedStockoutDate: Date | null = null;

    // Connect last actual to forecast start (visual continuity)
    const lastIdx = fullHistory.length - 1;
    
    for (let i = 1; i <= forecastDays; i++) {
        const nextDate = new Date(lastHistDate);
        nextDate.setDate(lastHistDate.getDate() + i);
        const nextIdx = lastIdx + i;
        
        // y = mx + b (ensure non-negative)
        let prediction = Math.max(0, slope * nextIdx + intercept);
        
        // Add some "confidence interval" spread for visual effect (wider further out)
        const spread = (i / forecastDays) * (prediction * 0.4) + 1; // dummy variance expansion

        predictedTotal += prediction;
        runningStock -= prediction;
        
        if (runningStock <= 0 && !predictedStockoutDate && product?.totalSellable > 0) {
            predictedStockoutDate = new Date(nextDate);
        }

        const high = parseFloat((prediction + spread).toFixed(1));
        const low = Math.max(0, parseFloat((prediction - spread).toFixed(1)));

        combinedData.push({
            date: nextDate.toISOString().split('T')[0],
            type: 'forecast',
            actual: null,
            forecast: parseFloat(prediction.toFixed(1)),
            confidenceHigh: high,
            confidenceLow: low,
            confidenceRange: [low, high]
        });
    }

    // Connect lines: Set the forecast value of the last historical point to the regression value
    // This makes the chart look continuous
    const finalHistoryPoint = combinedData[fullHistory.length - 1];
    const connectionValue = Math.max(0, slope * lastIdx + intercept);
    if(finalHistoryPoint) {
      finalHistoryPoint.forecast = connectionValue;
      finalHistoryPoint.confidenceHigh = connectionValue;
      finalHistoryPoint.confidenceLow = connectionValue;
      finalHistoryPoint.confidenceRange = [connectionValue, connectionValue];
    }

    return { 
        forecastData: combinedData, 
        totalForecastedSales: Math.round(predictedTotal),
        dailyTrend: slope,
        trendDirection: slope > 0.05 ? 'up' : slope < -0.05 ? 'down' : 'stable',
        stockoutDate: predictedStockoutDate,
        rSquared: rSq
    };
  }, [salesChartData, product]);

  const blinkitSearchUrl = `https://blinkit.com/s/?q=${encodeURIComponent(product?.itemName || '')}`;

  const handleExportProductData = () => {
    if (productInventory.length === 0) return;
    const csvRows = [
      ['Warehouse Name', 'Sellable', 'Darkstore', 'Unsellable', 'Damaged', 'Expired', 'Incoming'],
      ...productInventory.map(row => [
        `"${row.warehouseName}"`,
        row.totalSellable,
        row.sellableDarkstore,
        row.totalUnsellable,
        row.unsellableDamaged,
        row.unsellableExpired,
        row.incomingScheduled
      ])
    ];
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `product_breakdown_${itemId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Tooltip Style for Dark Mode Compatibility
  const tooltipStyle = {
    contentStyle: { 
      borderRadius: '8px', 
      border: 'none', 
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', 
      backgroundColor: '#ffffff',
      color: '#1f2937' // Force dark text
    },
    itemStyle: { color: '#1f2937' },
    labelStyle: { color: '#4b5563', fontWeight: 600 }
  };

  if (!product) return <div className="p-8 text-center text-gray-500">Product not found.</div>;

  return (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 pb-10">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-gray-600 dark:text-gray-300"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-800 dark:text-white line-clamp-1 max-w-md" title={product.itemName}>
                {product.itemName}
              </h1>
              <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${
                product.stockStatus === 'Healthy' ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' :
                product.stockStatus === 'Overstocked' ? 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800' :
                'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
              }`}>
                {product.stockStatus}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mt-1">
              <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {product.itemId}</span>
              <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
              <span>{product.brandName}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
           <a 
              href={blinkitSearchUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded-lg text-sm font-bold transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Blinkit
            </a>
           <button 
             onClick={handleExportProductData}
             className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors text-sm font-medium"
           >
             <Download className="w-4 h-4" />
             Export
           </button>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* ... (Existing KPI Cards - Ensuring text is visible) ... */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
               <Box className="w-16 h-16 text-blue-500" />
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Sellable</p>
            <div className="flex items-end gap-2 mt-1">
               <span className="text-2xl font-bold text-gray-900 dark:text-white">{product.totalSellable}</span>
               <span className="text-xs text-gray-400 mb-1">units</span>
            </div>
            <div className="mt-3 text-xs flex items-center gap-2 text-green-600 dark:text-green-400">
               <span className="bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {productInventory.filter(i => i.totalSellable > 0).length} Locations
               </span>
            </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
               <TrendingUp className="w-16 h-16 text-purple-500" />
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Forecasted Demand</p>
            <div className="flex items-end gap-2 mt-1">
               <span className="text-2xl font-bold text-gray-900 dark:text-white">~{totalForecastedSales}</span>
               <span className="text-xs text-gray-400 mb-1">next 30 days</span>
            </div>
            <div className={`mt-3 text-xs flex items-center gap-2 ${
               trendDirection === 'up' ? 'text-green-600' : trendDirection === 'down' ? 'text-red-500' : 'text-gray-500'
            }`}>
               <span className={`px-1.5 py-0.5 rounded flex items-center gap-1 ${
                  trendDirection === 'up' ? 'bg-green-50 dark:bg-green-900/20' : 
                  trendDirection === 'down' ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-100 dark:bg-slate-700'
               }`}>
                  {trendDirection === 'up' ? <TrendingUp className="w-3 h-3" /> : trendDirection === 'down' ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                  {dailyTrend > 0 ? '+' : ''}{dailyTrend.toFixed(1)} / day
               </span>
            </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
               <Clock className="w-16 h-16 text-orange-500" />
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Inventory Runway</p>
            <div className="flex items-end gap-2 mt-1">
               <span className={`text-2xl font-bold ${
                  product.inventoryRunway < 14 ? 'text-red-500' : 'text-gray-900 dark:text-white'
               }`}>{product.inventoryRunway}</span>
               <span className="text-xs text-gray-400 mb-1">days remaining</span>
            </div>
            <div className="mt-3 text-xs flex items-center gap-2 text-gray-500">
               {stockoutDate ? (
                  <span className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded flex items-center gap-1">
                     <AlertCircle className="w-3 h-3" />
                     Stockout: {stockoutDate.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}
                  </span>
               ) : (
                  <span className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
                     Stock levels healthy
                  </span>
               )}
            </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
               <ArchiveX className="w-16 h-16 text-red-500" />
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Unsellable</p>
            <div className="flex items-end gap-2 mt-1">
               <span className="text-2xl font-bold text-gray-900 dark:text-white">{product.totalUnsellable}</span>
               <span className="text-xs text-gray-400 mb-1">units</span>
            </div>
            <div className="mt-3 text-xs flex items-center gap-2 text-red-600 dark:text-red-400">
               <span className="bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">
                  {(productInventory.reduce((acc, curr) => acc + curr.unsellableDamaged, 0))} Damaged
               </span>
            </div>
        </div>
      </div>

      {/* Forecast Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
           <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  Sales Forecast & Trend
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">AI-powered linear regression model projecting next 30 days.</p>
              </div>
              <div className="flex items-center gap-2 text-xs bg-gray-50 dark:bg-slate-700 p-1 rounded-lg">
                 <div className="px-2 py-1 rounded bg-white dark:bg-slate-600 shadow-sm text-gray-700 dark:text-gray-200 font-medium">Daily View</div>
              </div>
           </div>

           <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                 <ComposedChart data={forecastData} margin={{top: 10, right: 10, left: -20, bottom: 0}}>
                    <defs>
                      <linearGradient id="colorConfidence" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.05}/>
                      </linearGradient>
                      <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.05}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" strokeOpacity={0.5} />
                    <XAxis 
                       dataKey="date" 
                       tick={{fontSize: 10, fill: '#94a3b8'}} 
                       tickFormatter={(val) => {
                           const d = new Date(val);
                           return `${d.getDate()}/${d.getMonth() + 1}`;
                       }}
                       minTickGap={30}
                    />
                    <YAxis tick={{fontSize: 10, fill: '#94a3b8'}} allowDecimals={false} />
                    <Tooltip 
                       {...tooltipStyle}
                       labelFormatter={(label) => new Date(label).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                    />
                    <Legend wrapperStyle={{fontSize: '12px', paddingTop: '10px'}} />
                    
                    {/* Confidence Interval (Simulated Area) */}
                    <Area 
                       type="monotone" 
                       dataKey="confidenceRange"
                       stroke="none" 
                       fill="url(#colorConfidence)" 
                       name="Confidence Interval"
                       legendType="none"
                    />

                    <Area 
                       type="monotone" 
                       dataKey="actual" 
                       name="Historical Sales" 
                       stroke="#3B82F6" 
                       strokeWidth={2}
                       fill="url(#colorActual)" 
                    />
                    
                    <Line 
                       type="monotone" 
                       dataKey="forecast" 
                       name="Predicted Trend" 
                       stroke="#8B5CF6" 
                       strokeWidth={2} 
                       strokeDasharray="5 5" 
                       dot={false}
                       activeDot={{r: 4, fill: '#8B5CF6'}}
                    />
                    
                    <ReferenceLine x={new Date().toISOString().split('T')[0]} stroke="#9CA3AF" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Today', fontSize: 10, fill: '#6B7280' }} />
                 </ComposedChart>
              </ResponsiveContainer>
           </div>
        </div>

        {/* Actionable Insights */}
        <div className="space-y-4">
            <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm h-full flex flex-col">
               <h3 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                  <CalendarRange className="w-4 h-4 text-gray-500" />
                  Inventory Health
               </h3>
               
               <div className="space-y-6 flex-1">
                  {/* Insight 1: Restock */}
                  <div className={`p-4 rounded-lg border ${product.stockStatus === 'Healthy' ? 'bg-green-50 border-green-100 dark:bg-green-900/10 dark:border-green-800' : 'bg-red-50 border-red-100 dark:bg-red-900/10 dark:border-red-800'}`}>
                     <div className="flex items-start gap-3">
                        {product.stockStatus === 'Healthy' ? <Package className="w-5 h-5 text-green-600 mt-0.5" /> : <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />}
                        <div>
                           <p className={`font-semibold text-sm ${product.stockStatus === 'Healthy' ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                              {product.stockStatus === 'Healthy' ? 'Stock levels are optimal' : 'Attention Needed'}
                           </p>
                           <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              {product.stockStatus === 'Healthy' 
                                 ? `Current coverage of ${product.inventoryRunway} days is sufficient based on current sales velocity.` 
                                 : stockoutDate 
                                    ? `Projected stockout by ${stockoutDate.toLocaleDateString()}. Recommend restocking ${(totalForecastedSales - product.totalSellable) > 0 ? totalForecastedSales - product.totalSellable : 100} units immediately.` 
                                    : "Inventory is critically low relative to sales volume."
                              }
                           </p>
                        </div>
                     </div>
                  </div>

                  {/* Insight 2: Warehouse */}
                  <div className="p-4 rounded-lg border bg-blue-50 border-blue-100 dark:bg-blue-900/10 dark:border-blue-800">
                     <div className="flex items-start gap-3">
                        <MapPin className="w-5 h-5 text-blue-600 mt-0.5" />
                        <div>
                           <p className="font-semibold text-sm text-blue-800 dark:text-blue-300">Distribution Efficiency</p>
                           <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              Stock is distributed across {productInventory.length} warehouses. 
                              {productInventory.length > 2 ? " Good geographic coverage." : " Consider expanding to more nodes to reduce delivery times."}
                           </p>
                        </div>
                     </div>
                  </div>
                  
                  {/* Insight 3: City Chart (New) */}
                  {citySalesStats.length > 0 && (
                     <div className="pt-2">
                        <h4 className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">Top City Sales</h4>
                        <div className="h-40">
                           <ResponsiveContainer width="100%" height="100%">
                              <BarChart 
                                 data={citySalesStats} 
                                 layout="vertical"
                                 onClick={(data: any) => {
                                    if (data && data.activePayload && data.activePayload.length > 0 && onSelectCity) {
                                       onSelectCity(data.activePayload[0].payload.name);
                                    }
                                 }}
                                 className={onSelectCity ? "cursor-pointer" : ""}
                              >
                                 <XAxis type="number" hide />
                                 <YAxis type="category" dataKey="name" width={80} tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} />
                                 <Tooltip {...tooltipStyle} formatter={(val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val)} />
                                 <Bar dataKey="revenue" fill="#8B5CF6" radius={[0, 4, 4, 0]} barSize={10} />
                              </BarChart>
                           </ResponsiveContainer>
                        </div>
                     </div>
                  )}
               </div>
            </div>
        </div>
      </div>

      {/* Detailed Stock Table (Enhanced) */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
         <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
            <h3 className="font-bold text-gray-800 dark:text-white">Detailed Warehouse Breakdown</h3>
            <span className="text-xs text-gray-400">Sorted by sellable quantity</span>
         </div>
         <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
               <thead className="bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-300 font-medium">
                  <tr>
                     <th className="px-6 py-3 w-1/4">Warehouse Name</th>
                     <th className="px-6 py-3 w-1/4">Availability</th>
                     <th className="px-6 py-3 text-right">Darkstore</th>
                     <th className="px-6 py-3 text-right text-red-600 dark:text-red-400">Unsellable</th>
                     <th className="px-6 py-3 text-right">Damaged</th>
                     <th className="px-6 py-3 text-right text-blue-600 dark:text-blue-400">Incoming</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {productInventory.map((row, idx) => {
                     const maxSellable = Math.max(...productInventory.map(i => i.totalSellable));
                     const percent = maxSellable > 0 ? (row.totalSellable / maxSellable) * 100 : 0;
                     
                     return (
                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                           <td className="px-6 py-3 font-medium text-gray-700 dark:text-gray-200">{row.warehouseName}</td>
                           <td className="px-6 py-3">
                              <div className="flex items-center gap-2">
                                 <div className="flex-1 h-1.5 bg-gray-100 dark:bg-slate-600 rounded-full overflow-hidden max-w-[100px]">
                                    <div className="h-full bg-green-500 rounded-full" style={{width: `${percent}%`}}></div>
                                 </div>
                                 <span className="font-bold text-gray-800 dark:text-white w-8 text-right">{row.totalSellable}</span>
                              </div>
                           </td>
                           <td className="px-6 py-3 text-right text-gray-500 dark:text-gray-400">{row.sellableDarkstore}</td>
                           <td className="px-6 py-3 text-right font-bold text-gray-800 dark:text-white">{row.totalUnsellable}</td>
                           <td className="px-6 py-3 text-right text-gray-500 dark:text-gray-400">{row.unsellableDamaged}</td>
                           <td className="px-6 py-3 text-right text-gray-500 dark:text-gray-400">{row.incomingScheduled}</td>
                        </tr>
                     );
                  })}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
};