import React, { useMemo, useState } from 'react';
import { SalesRecord, InventoryRecord } from '../types';
import { 
  ArrowLeft, MapPin, IndianRupee, ShoppingBag, TrendingUp, Search, 
  ArrowUpDown, Download, CheckCircle2, Package
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

interface CityDetailProps {
  cityName: string;
  salesData: SalesRecord[];
  inventoryData?: InventoryRecord[];
  onBack: () => void;
  onSelectProduct: (itemId: string) => void;
}

const COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#84CC16'];

export const CityDetail: React.FC<CityDetailProps> = ({ 
  cityName, 
  salesData, 
  inventoryData = [], 
  onBack, 
  onSelectProduct 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'units' | 'revenue' | 'name'>('units');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filter data for this city
  const citySales = useMemo(() => 
    salesData.filter(s => (s.customerCity || 'Unknown').trim().toLowerCase() === cityName.trim().toLowerCase()), 
  [salesData, cityName]);

  // Inventory lookup for item names & brand
  const invMap = useMemo(() => {
    const map = new Map<string, InventoryRecord>();
    inventoryData.forEach(inv => {
      if (!map.has(inv.itemId)) {
        map.set(inv.itemId, inv);
      }
    });
    return map;
  }, [inventoryData]);

  // Aggregate by Product
  const productStats = useMemo(() => {
    const map = new Map<string, { itemId: string; name: string; brand: string; revenue: number; quantity: number }>();
    
    citySales.forEach(s => {
      const invMatch = invMap.get(s.itemId);
      const name = s.itemName || invMatch?.itemName || `Product ${s.itemId}`;
      const brand = s.brandName || invMatch?.brandName || 'Unknown';

      if (!map.has(s.itemId)) {
        map.set(s.itemId, { 
          itemId: s.itemId, 
          name, 
          brand, 
          revenue: 0, 
          quantity: 0 
        });
      }
      const entry = map.get(s.itemId)!;
      entry.revenue += s.revenue;
      entry.quantity += s.quantity;
    });

    return Array.from(map.values());
  }, [citySales, invMap]);

  // KPI Calculations
  const totalRevenue = productStats.reduce((sum, p) => sum + p.revenue, 0);
  const totalUnits = productStats.reduce((sum, p) => sum + p.quantity, 0);
  const uniqueProducts = productStats.length;
  const topProductByUnits = [...productStats].sort((a, b) => b.quantity - a.quantity)[0];
  const averageASP = totalUnits > 0 ? totalRevenue / totalUnits : 0;

  // Chart Data (Top 6 Products by Units)
  const chartData = [...productStats]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 6)
    .map(p => ({
      name: p.name.length > 20 ? p.name.substring(0, 20) + '...' : p.name,
      value: p.quantity,
      revenue: p.revenue
    }));

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  // Sorting handler
  const handleSort = (field: 'units' | 'revenue' | 'name') => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // Filtered & sorted list for table
  const sortedAndFilteredProducts = useMemo(() => {
    return productStats
      .filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.itemId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.brand.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => {
        let diff = 0;
        if (sortBy === 'units') diff = b.quantity - a.quantity;
        else if (sortBy === 'revenue') diff = b.revenue - a.revenue;
        else if (sortBy === 'name') diff = a.name.localeCompare(b.name);
        return sortOrder === 'asc' ? -diff : diff;
      });
  }, [productStats, searchTerm, sortBy, sortOrder]);

  // CSV Export for this city
  const handleExportCSV = () => {
    if (productStats.length === 0) return;
    const rows = [
      ['City', 'Item ID', 'Product Name', 'Brand', 'Units Sold', 'Total Revenue (INR)', 'ASP (INR)', 'Share of City Units (%)'],
      ...productStats.map(p => [
        cityName,
        p.itemId,
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.brand.replace(/"/g, '""')}"`,
        p.quantity,
        p.revenue,
        (p.quantity > 0 ? (p.revenue / p.quantity).toFixed(2) : '0'),
        (totalUnits > 0 ? ((p.quantity / totalUnits) * 100).toFixed(2) : '0') + '%'
      ])
    ];

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `City_Sales_${cityName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 pb-10">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors text-gray-700 dark:text-gray-200"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <MapPin className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                {cityName}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-xs font-bold">
                City Sales Analytics
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Product-wise units sold & revenue analysis in {cityName}
            </p>
          </div>
        </div>

        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-xl text-xs font-bold transition-colors border border-purple-200 dark:border-purple-800 self-start sm:self-auto"
        >
          <Download className="w-4 h-4" />
          Export {cityName} Data (CSV)
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-purple-100 dark:border-purple-900/30 shadow-sm">
           <div className="flex justify-between items-start">
              <div>
                 <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Units Sold</p>
                 <h3 className="text-3xl font-extrabold text-purple-600 dark:text-purple-400 mt-1">{totalUnits.toLocaleString()}</h3>
                 <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Across all orders in {cityName}</p>
              </div>
              <div className="p-3 bg-purple-50 dark:bg-purple-900/30 rounded-xl">
                 <ShoppingBag className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
           </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
           <div className="flex justify-between items-start">
              <div>
                 <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total City Revenue</p>
                 <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(totalRevenue)}</h3>
                 <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Avg ASP: ₹{averageASP.toFixed(0)}</p>
              </div>
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                 <IndianRupee className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
           </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
           <div className="flex justify-between items-start">
              <div>
                 <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Unique Products Sold</p>
                 <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{uniqueProducts} SKUs</h3>
                 <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Catalog reach in this region</p>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                 <Package className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
           </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
           <div className="flex justify-between items-start">
              <div className="min-w-0 pr-2">
                 <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">#1 Top Selling Product</p>
                 <h3 className="text-sm font-bold text-gray-900 dark:text-white mt-1 truncate" title={topProductByUnits?.name}>
                   {topProductByUnits?.name || 'N/A'}
                 </h3>
                 <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 mt-1">
                   {topProductByUnits ? `${topProductByUnits.quantity.toLocaleString()} units sold` : ''}
                 </p>
              </div>
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl shrink-0">
                 <TrendingUp className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
              </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Products Chart by Units Sold */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
           <div className="mb-4">
             <h3 className="text-base font-bold text-gray-900 dark:text-white">Top Products by Units in {cityName}</h3>
             <p className="text-xs text-gray-400 dark:text-gray-500">Highest volume drivers in this market</p>
           </div>
           <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                       formatter={(value: any, name: any, item: any) => [
                         `${value.toLocaleString()} Units (${formatCurrency(item.payload.revenue)})`,
                         'Volume'
                       ]}
                       contentStyle={{ 
                          backgroundColor: '#fff', 
                          borderRadius: '8px', 
                          border: 'none', 
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                          color: '#333' 
                       }}
                       itemStyle={{ color: '#333' }}
                    />
                    <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{fontSize: '11px', maxWidth: '120px'}} />
                 </PieChart>
              </ResponsiveContainer>
           </div>
        </div>

        {/* Product List Table */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col">
           <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-base">
                  Product Sales Breakdown in {cityName}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Showing {sortedAndFilteredProducts.length} products sold in {cityName}
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                 <div className="relative flex-1 sm:w-60">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input 
                       type="text" 
                       placeholder="Search product or SKU..." 
                       className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                       value={searchTerm}
                       onChange={(e) => setSearchTerm(e.target.value)}
                    />
                 </div>
              </div>
           </div>
           
           <div className="flex-1 overflow-x-auto">
              <table className="w-full text-xs text-left">
                 <thead className="bg-gray-50 dark:bg-slate-700/60 text-gray-600 dark:text-gray-300 font-semibold border-b border-gray-100 dark:border-slate-700">
                    <tr>
                       <th className="px-5 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700" onClick={() => handleSort('name')}>
                          <div className="flex items-center gap-1.5">
                             Product Name & SKU
                             <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
                          </div>
                       </th>
                       <th className="px-5 py-3 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 bg-purple-50/50 dark:bg-purple-950/20" onClick={() => handleSort('units')}>
                          <div className="flex items-center justify-end gap-1.5 text-purple-700 dark:text-purple-300 font-bold">
                             Units Sold
                             <ArrowUpDown className="w-3.5 h-3.5" />
                          </div>
                       </th>
                       <th className="px-5 py-3 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700" onClick={() => handleSort('revenue')}>
                          <div className="flex items-center justify-end gap-1.5">
                             Revenue
                             <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
                          </div>
                       </th>
                       <th className="px-5 py-3 text-right">ASP (Price)</th>
                       <th className="px-5 py-3 text-right">% of City</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {sortedAndFilteredProducts.map((p, idx) => {
                       const asp = p.quantity > 0 ? p.revenue / p.quantity : 0;
                       const pct = totalUnits > 0 ? (p.quantity / totalUnits) * 100 : 0;
                       return (
                          <tr 
                             key={p.itemId} 
                             onClick={() => onSelectProduct(p.itemId)}
                             className="hover:bg-purple-50/60 dark:hover:bg-purple-900/20 cursor-pointer transition-colors group"
                             title="Click to view product details"
                          >
                             <td className="px-5 py-3">
                                <div className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-purple-600 dark:group-hover:text-purple-400 truncate max-w-sm" title={p.name}>
                                   {p.name}
                                </div>
                                <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-2">
                                  <span>ID: {p.itemId}</span>
                                  <span>•</span>
                                  <span className="text-gray-600 dark:text-gray-400 font-medium">{p.brand}</span>
                                </div>
                             </td>
                             <td className="px-5 py-3 text-right bg-purple-50/30 dark:bg-purple-950/10">
                                <span className="inline-block px-2.5 py-1 rounded-md bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300 font-extrabold text-sm">
                                   {p.quantity.toLocaleString()}
                                </span>
                             </td>
                             <td className="px-5 py-3 text-right font-medium text-gray-900 dark:text-white">
                                {formatCurrency(p.revenue)}
                             </td>
                             <td className="px-5 py-3 text-right font-medium text-gray-600 dark:text-gray-300">
                                ₹{asp.toFixed(0)}
                             </td>
                             <td className="px-5 py-3 text-right">
                                <div className="font-medium text-gray-700 dark:text-gray-300">{pct.toFixed(1)}%</div>
                                <div className="w-16 bg-gray-200 dark:bg-slate-700 rounded-full h-1 mt-1 ml-auto overflow-hidden">
                                   <div className="bg-purple-600 h-1 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                                </div>
                             </td>
                          </tr>
                       );
                    })}
                    {sortedAndFilteredProducts.length === 0 && (
                       <tr>
                          <td colSpan={5} className="px-6 py-10 text-center text-gray-400 dark:text-slate-500">
                             No products found matching your search.
                          </td>
                       </tr>
                    )}
                 </tbody>
              </table>
           </div>
        </div>
      </div>
    </div>
  );
};
