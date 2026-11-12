import React, { useMemo, useState, useRef, useEffect } from 'react';
import { AdvertisementRecord } from '../types';
import { aggregateAdsData } from '../utils';
import { 
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area 
} from 'recharts';
import { 
  Megaphone, TrendingUp, IndianRupee, MousePointer, Filter, Download, ArrowUpRight, ArrowDownRight, 
  ChevronDown, FileText, FileSpreadsheet, Image as ImageIcon, ArrowLeft, Layers, Activity, BarChart2, Target
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

interface AdsAnalyticsProps {
  data: AdvertisementRecord[];
}

type ChartType = 'mixed' | 'bar' | 'line';
type TimePeriod = 'daily' | 'weekly' | 'monthly';

export const AdsAnalytics: React.FC<AdsAnalyticsProps> = ({ data }) => {
  const [filterCampaign, setFilterCampaign] = useState('All');
  const [selectedCampaignName, setSelectedCampaignName] = useState<string | null>(null);
  const [chartType, setChartType] = useState<ChartType>('mixed');
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('daily');
  const [showExportMenu, setShowExportMenu] = useState(false);
  
  const chartRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const campaigns = useMemo(() => Array.from(new Set(data.map(d => d.campaignName))).sort(), [data]);

  // Determine which data to use (Global or Specific Campaign)
  const activeData = useMemo(() => {
    if (selectedCampaignName) {
      return data.filter(d => d.campaignName === selectedCampaignName);
    }
    if (filterCampaign === 'All') return data;
    return data.filter(d => d.campaignName === filterCampaign);
  }, [data, filterCampaign, selectedCampaignName]);

  const { daily, weekly, monthly, totals } = useMemo(() => aggregateAdsData(activeData), [activeData]);

  const currentChartData = useMemo(() => {
    switch (timePeriod) {
        case 'weekly': return weekly;
        case 'monthly': return monthly;
        case 'daily': 
        default: return daily;
    }
  }, [timePeriod, daily, weekly, monthly]);

  // --- Statistics Logic ---

  // 1. Campaign Level Stats (Main View)
  const campaignStats = useMemo(() => {
    const statsMap = new Map<string, { 
      name: string; 
      spend: number; 
      sales: number; 
      impressions: number; 
      orders: number; 
      roas: number 
    }>();

    activeData.forEach(d => {
      if (!statsMap.has(d.campaignName)) {
        statsMap.set(d.campaignName, { name: d.campaignName, spend: 0, sales: 0, impressions: 0, orders: 0, roas: 0 });
      }
      const entry = statsMap.get(d.campaignName)!;
      entry.spend += d.spend;
      entry.sales += (d.directSales + d.indirectSales);
      entry.impressions += d.impressions;
      entry.orders += (d.directUnits + d.indirectUnits);
    });

    return Array.from(statsMap.values()).map(s => ({
      ...s,
      roas: s.spend > 0 ? s.sales / s.spend : 0
    })).sort((a, b) => b.spend - a.spend);
  }, [activeData]);

  // 2. Keyword/Targeting Level Stats (Detail View)
  const targetingStats = useMemo(() => {
    if (!selectedCampaignName) return [];

    const statsMap = new Map<string, { 
      target: string; 
      type: string;
      spend: number; 
      sales: number; 
      impressions: number; 
      orders: number; 
      roas: number 
    }>();

    activeData.forEach(d => {
      const key = `${d.targetingValue}-${d.targetingType}`; // Unique key
      if (!statsMap.has(key)) {
        statsMap.set(key, { 
            target: d.targetingValue || '(No Target)', 
            type: d.targetingType, 
            spend: 0, 
            sales: 0, 
            impressions: 0, 
            orders: 0, 
            roas: 0 
        });
      }
      const entry = statsMap.get(key)!;
      entry.spend += d.spend;
      entry.sales += (d.directSales + d.indirectSales);
      entry.impressions += d.impressions;
      entry.orders += (d.directUnits + d.indirectUnits);
    });

    return Array.from(statsMap.values()).map(s => ({
      ...s,
      roas: s.spend > 0 ? s.sales / s.spend : 0
    })).sort((a, b) => b.spend - a.spend);
  }, [activeData, selectedCampaignName]);


  // --- Formatters ---
  const formatCurrency = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
  const formatNumber = (val: number) => new Intl.NumberFormat('en-IN').format(val);

  // --- Export Handlers ---
  // ... (export functions remain unchanged)
  const handleExportCSV = () => {
    const dataToExport = selectedCampaignName ? targetingStats : campaignStats;
    const filename = selectedCampaignName 
        ? `campaign_${selectedCampaignName.replace(/\s+/g, '_')}_targets` 
        : `all_campaigns_performance`;

    const headers = selectedCampaignName 
        ? ['Target Value', 'Target Type', 'Spend', 'Revenue', 'ROAS', 'Impressions', 'Orders']
        : ['Campaign Name', 'Spend', 'Revenue', 'ROAS', 'Impressions', 'Orders'];

    const rows = dataToExport.map(row => {
        if(selectedCampaignName) {
            const r = row as typeof targetingStats[0];
            return [`"${r.target}"`, r.type, r.spend, r.sales, r.roas.toFixed(2), r.impressions, r.orders];
        } else {
            const r = row as typeof campaignStats[0];
            return [`"${r.name}"`, r.spend, r.sales, r.roas.toFixed(2), r.impressions, r.orders];
        }
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  const handleExportExcel = () => {
    const dataToExport = selectedCampaignName ? targetingStats : campaignStats;
    const filename = selectedCampaignName ? `Campaign_${selectedCampaignName}` : `Ads_Overview`;
    
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Performance");
    XLSX.writeFile(workbook, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
    setShowExportMenu(false);
  };

  const handleExportPDF = async () => {
    // 1. Setup PDF
    const doc = new jsPDF('p', 'mm', 'a4');
    const title = selectedCampaignName ? `Campaign Analysis: ${selectedCampaignName}` : "Blinkit Ads Campaign Overview";
    const reportDate = `Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
    
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(reportDate, 14, 22);
    doc.setTextColor(0); // Reset color

    let startY = 30;

    // 2. Capture Chart
    if (chartRef.current) {
        const originalBg = chartRef.current.style.background;
        const originalColor = chartRef.current.style.color;
        
        chartRef.current.style.background = '#ffffff';
        chartRef.current.style.color = '#000000';
        
        try {
            const canvas = await html2canvas(chartRef.current, { 
                scale: 2,
                backgroundColor: '#ffffff',
                logging: false
            });
            const imgData = canvas.toDataURL('image/png');
            
            // Calculate dimensions to fit A4 width (210mm - margins)
            const imgWidth = 180; // 15mm margin each side
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            doc.addImage(imgData, 'PNG', 15, startY, imgWidth, imgHeight);
            startY += imgHeight + 10; // Add spacing after image
        } catch (error) {
            console.error("Error capturing chart for PDF:", error);
            doc.text("(Chart could not be generated)", 14, startY + 10);
            startY += 20;
        } finally {
            // Restore styles
            chartRef.current.style.background = originalBg;
            chartRef.current.style.color = originalColor;
        }
    }

    // 3. Generate Table
    const headers = selectedCampaignName 
        ? [['Target', 'Type', 'Spend', 'Revenue', 'ROAS', 'Orders']]
        : [['Campaign Name', 'Spend', 'Revenue', 'ROAS', 'Imp', 'Orders']];

    const dataToExport = selectedCampaignName ? targetingStats : campaignStats;
    const rows = dataToExport.map(row => {
         if(selectedCampaignName) {
            const r = row as typeof targetingStats[0];
            return [r.target, r.type, Math.round(r.spend), Math.round(r.sales), r.roas.toFixed(2), r.orders];
         } else {
            const r = row as typeof campaignStats[0];
            return [r.name, Math.round(r.spend), Math.round(r.sales), r.roas.toFixed(2), r.impressions, r.orders];
         }
    });

    autoTable(doc, {
      head: headers,
      body: rows,
      startY: startY,
      margin: { top: 15 },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [124, 58, 237] }, // Purple header
      theme: 'striped'
    });

    doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
    setShowExportMenu(false);
  };

  const handleExportImage = async () => {
    if (chartRef.current) {
        // Temporarily set background to white for capture if transparent
        const originalBg = chartRef.current.style.background;
        chartRef.current.style.background = '#FFFFFF';
        
        try {
            const canvas = await html2canvas(chartRef.current, { scale: 2 });
            const link = document.createElement('a');
            link.download = `chart_export_${new Date().getTime()}.png`;
            link.href = canvas.toDataURL();
            link.click();
        } catch (e) {
            console.error("Image export failed", e);
        } finally {
            chartRef.current.style.background = originalBg;
            setShowExportMenu(false);
        }
    }
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

  // --- Render ---

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-3">
          {selectedCampaignName && (
              <button 
                onClick={() => setSelectedCampaignName(null)}
                className="p-2 rounded-lg bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 transition-colors"
              >
                  <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
          )}
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
              {selectedCampaignName ? <Target className="w-6 h-6 text-purple-600" /> : <Megaphone className="w-6 h-6 text-purple-600" />}
              {selectedCampaignName || "Ad Campaign Analytics"}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
                {selectedCampaignName ? "Detailed breakdown by Targeting Keywords" : "Performance insights from Blinkit Ad Manager"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Campaign Filter (Only visible if not drilled down) */}
          {!selectedCampaignName && (
            <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select 
                className="pl-9 pr-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500 text-gray-700 dark:text-white"
                value={filterCampaign}
                onChange={(e) => setFilterCampaign(e.target.value)}
                >
                <option value="All">All Campaigns</option>
                {campaigns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>
          )}

          {/* Export Menu */}
          <div className="relative" ref={exportMenuRef}>
            <button 
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium shadow-md shadow-purple-200 dark:shadow-none"
            >
                <Download className="w-4 h-4" />
                Export
                <ChevronDown className="w-3 h-3" />
            </button>
            
            {showExportMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-gray-100 dark:border-slate-700 z-50 animate-in slide-in-from-top-2 fade-in duration-200 overflow-hidden">
                    <button onClick={handleExportExcel} className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-green-600" /> Export Excel
                    </button>
                    <button onClick={handleExportCSV} className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" /> Export CSV
                    </button>
                    <button onClick={handleExportPDF} className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-red-600" /> Export PDF
                    </button>
                    <div className="border-t border-gray-100 dark:border-slate-700 my-1"></div>
                    <button onClick={handleExportImage} className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-purple-600" /> Save Chart as Pic
                    </button>
                </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* ... (KPI cards code similar to previous, ensure colors are visible) */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
           <div className="flex justify-between items-start">
              <div>
                 <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Spend</p>
                 <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(totals.totalSpend)}</h3>
              </div>
              <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                 <IndianRupee className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
           </div>
        </div>
        {/* ... (other KPI cards) ... */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
           <div className="flex justify-between items-start">
              <div>
                 <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Ad Revenue</p>
                 <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(totals.totalSales)}</h3>
              </div>
              <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                 <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
           </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
           <div className="flex justify-between items-start">
              <div>
                 <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total ROAS</p>
                 <h3 className={`text-2xl font-bold mt-1 flex items-center gap-2 ${totals.totalRoas >= 3 ? 'text-green-600' : totals.totalRoas >= 1.5 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {totals.totalRoas.toFixed(2)}x
                    {totals.totalRoas >= 3 ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                 </h3>
              </div>
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                 <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
           </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
           <div className="flex justify-between items-start">
              <div>
                 <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Impressions</p>
                 <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{formatNumber(totals.totalImpressions)}</h3>
              </div>
              <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                 <MousePointer className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
           </div>
        </div>
      </div>

      {/* Main Chart */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm" ref={chartRef}>
         <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                {selectedCampaignName ? "Campaign Trend Analysis" : "Overall Spend vs Revenue"}
            </h3>
            
            <div className="flex flex-wrap items-center gap-2">
                {/* Time Period Selector */}
                <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-1">
                    {['daily', 'weekly', 'monthly'].map((period) => (
                      <button
                        key={period}
                        onClick={() => setTimePeriod(period as TimePeriod)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-all ${
                          timePeriod === period 
                            ? 'bg-white dark:bg-slate-600 text-purple-600 dark:text-purple-400 shadow-sm' 
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                      >
                        {period}
                      </button>
                    ))}
                </div>

                <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-1">
                    <button
                      onClick={() => setChartType('mixed')}
                      className={`p-1.5 rounded-md transition-all ${chartType === 'mixed' ? 'bg-white dark:bg-slate-600 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-gray-400 dark:text-gray-400 hover:text-gray-700'}`}
                      title="Mixed Chart"
                    >
                      <Layers className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setChartType('line')}
                      className={`p-1.5 rounded-md transition-all ${chartType === 'line' ? 'bg-white dark:bg-slate-600 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-gray-400 dark:text-gray-400 hover:text-gray-700'}`}
                      title="Line Chart"
                    >
                      <Activity className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setChartType('bar')}
                      className={`p-1.5 rounded-md transition-all ${chartType === 'bar' ? 'bg-white dark:bg-slate-600 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-gray-400 dark:text-gray-400 hover:text-gray-700'}`}
                      title="Bar Chart"
                    >
                      <BarChart2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
         </div>

         <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
               <ComposedChart data={currentChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                     <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                     </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" strokeOpacity={0.5} />
                  <XAxis 
                     dataKey="label" 
                     tick={{ fontSize: 11, fill: '#94a3b8' }} 
                     minTickGap={30}
                     axisLine={false}
                     tickLine={false}
                  />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#EF4444' }} tickFormatter={(val) => `₹${val}`} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#10B981' }} tickFormatter={(val) => `₹${val}`} axisLine={false} tickLine={false} />
                  <Tooltip 
                     {...tooltipStyle}
                     formatter={(value: any, name: string) => [formatCurrency(value), name === 'revenue' ? 'Sales' : 'Ad Spend']}
                     labelFormatter={(label) => label}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  
                  {chartType === 'mixed' && (
                    <>
                        <Bar yAxisId="left" dataKey="spend" name="Ad Spend" fill="#EF4444" barSize={20} radius={[4, 4, 0, 0]} opacity={0.8} />
                        <Area yAxisId="right" type="monotone" dataKey="revenue" name="Total Sales" stroke="#10B981" strokeWidth={2} fill="url(#colorRevenue)" />
                    </>
                  )}
                  {chartType === 'bar' && (
                    <>
                        <Bar yAxisId="left" dataKey="spend" name="Ad Spend" fill="#EF4444" barSize={20} radius={[4, 4, 0, 0]} />
                        <Bar yAxisId="right" dataKey="revenue" name="Total Sales" fill="#10B981" barSize={20} radius={[4, 4, 0, 0]} />
                    </>
                  )}
                  {chartType === 'line' && (
                    <>
                        <Line yAxisId="left" type="monotone" dataKey="spend" name="Ad Spend" stroke="#EF4444" strokeWidth={2} dot={{r:3}} />
                        <Line yAxisId="right" type="monotone" dataKey="revenue" name="Total Sales" stroke="#10B981" strokeWidth={2} dot={{r:3}} />
                    </>
                  )}
                  
               </ComposedChart>
            </ResponsiveContainer>
         </div>
      </div>

      {/* Detail Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
         <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
            <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                    {selectedCampaignName ? "Keyword & Targeting Performance" : "Campaign Performance"}
                </h3>
                {selectedCampaignName && (
                    <p className="text-xs text-gray-500 mt-1">Breakdown of specific targets within <strong>{selectedCampaignName}</strong></p>
                )}
            </div>
            {!selectedCampaignName && (
                <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded dark:bg-blue-900/20 dark:text-blue-400">Click row for details</span>
            )}
         </div>
         <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
               <thead className="bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-300 font-medium">
                  <tr>
                     <th className="px-6 py-3">{selectedCampaignName ? "Targeting Value" : "Campaign Name"}</th>
                     {selectedCampaignName && <th className="px-6 py-3">Type</th>}
                     <th className="px-6 py-3 text-right">Spend</th>
                     <th className="px-6 py-3 text-right">Revenue</th>
                     <th className="px-6 py-3 text-right">ROAS</th>
                     <th className="px-6 py-3 text-right">Orders</th>
                     <th className="px-6 py-3 text-right">Impressions</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {selectedCampaignName ? (
                      // Drill Down Rows
                      targetingStats.map((target, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                            <td className="px-6 py-4 font-medium text-gray-800 dark:text-white max-w-xs truncate" title={target.target}>
                                {target.target}
                            </td>
                            <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{target.type}</td>
                            <td className="px-6 py-4 text-right text-red-600 dark:text-red-400">{formatCurrency(target.spend)}</td>
                            <td className="px-6 py-4 text-right text-green-600 dark:text-green-400">{formatCurrency(target.sales)}</td>
                            <td className="px-6 py-4 text-right">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                    target.roas >= 3 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                    target.roas >= 1.5 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                }`}>
                                    {target.roas.toFixed(2)}x
                                </span>
                            </td>
                            <td className="px-6 py-4 text-right text-gray-600 dark:text-gray-300">{target.orders}</td>
                            <td className="px-6 py-4 text-right text-gray-600 dark:text-gray-300">{formatNumber(target.impressions)}</td>
                        </tr>
                      ))
                  ) : (
                      // Main Campaign Rows
                      campaignStats.map((camp, idx) => (
                        <tr 
                            key={idx} 
                            className="hover:bg-purple-50 dark:hover:bg-purple-900/20 cursor-pointer transition-colors group"
                            onClick={() => setSelectedCampaignName(camp.name)}
                        >
                            <td className="px-6 py-4 font-medium text-gray-800 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400">
                                {camp.name}
                            </td>
                            <td className="px-6 py-4 text-right text-red-600 dark:text-red-400">{formatCurrency(camp.spend)}</td>
                            <td className="px-6 py-4 text-right text-green-600 dark:text-green-400">{formatCurrency(camp.sales)}</td>
                            <td className="px-6 py-4 text-right">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                                camp.roas >= 3 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                camp.roas >= 1.5 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            }`}>
                                {camp.roas.toFixed(2)}x
                            </span>
                            </td>
                            <td className="px-6 py-4 text-right text-gray-600 dark:text-gray-300">{camp.orders}</td>
                            <td className="px-6 py-4 text-right text-gray-600 dark:text-gray-300">{formatNumber(camp.impressions)}</td>
                        </tr>
                    ))
                  )}
                  
                  {((selectedCampaignName && targetingStats.length === 0) || (!selectedCampaignName && campaignStats.length === 0)) && (
                      <tr>
                          <td colSpan={7} className="px-6 py-8 text-center text-gray-500">No data found.</td>
                      </tr>
                  )}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
};