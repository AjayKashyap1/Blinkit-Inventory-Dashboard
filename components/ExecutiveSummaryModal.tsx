import React, { useMemo, useState } from 'react';
import { AdvertisementRecord, MergedItem } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { X, FileText, Copy, Check, Download, Share2, MessageSquare } from 'lucide-react';

interface ExecutiveSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalRevenue: number;
  totalUnitsSold: number;
  averageASP: number;
  totalSellable: number;
  totalUnsellable: number;
  topProducts: { id: string; fullName: string; revenue: number; qty: number; asp: number }[];
  topCities: { name: string; revenue: number; quantity: number }[];
  filteredItems: MergedItem[];
  adsData: AdvertisementRecord[];
  activeFilters: {
    brand: string;
    status: string;
    warehouse: string;
    startDate: string;
    endDate: string;
  };
}

export const ExecutiveSummaryModal: React.FC<ExecutiveSummaryModalProps> = ({
  isOpen,
  onClose,
  totalRevenue,
  totalUnitsSold,
  averageASP,
  totalSellable,
  totalUnsellable,
  topProducts,
  topCities,
  filteredItems,
  adsData,
  activeFilters,
}) => {
  const [copied, setCopied] = useState(false);

  const adsStats = useMemo(() => {
    const filteredAds = adsData.filter(a => {
      if (a.date) {
        if (activeFilters.startDate && a.date < activeFilters.startDate) return false;
        if (activeFilters.endDate && a.date > activeFilters.endDate) return false;
      }
      return true;
    });
    const spend = filteredAds.reduce((s, a) => s + a.spend, 0);
    const sales = filteredAds.reduce((s, a) => s + a.directSales + a.indirectSales, 0);
    const roas = spend > 0 ? sales / spend : 0;
    const tacos = totalRevenue > 0 ? (spend / totalRevenue) * 100 : 0;
    return { spend, sales, roas, tacos, hasAds: filteredAds.length > 0 };
  }, [adsData, activeFilters.startDate, activeFilters.endDate, totalRevenue]);

  const stockoutCount = useMemo(
    () => filteredItems.filter(i => i.stockStatus === 'Stockout').length,
    [filteredItems]
  );

  const lowStockCount = useMemo(
    () => filteredItems.filter(i => i.stockStatus === 'Low').length,
    [filteredItems]
  );

  const formatINR = (val: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  const formatPlainINR = (val: number) =>
    `Rs. ${Math.round(val).toLocaleString('en-IN')}`;

  const periodLabel = useMemo(() => {
    if (activeFilters.startDate && activeFilters.endDate) {
      return `${activeFilters.startDate} to ${activeFilters.endDate}`;
    }
    if (activeFilters.startDate) return `From ${activeFilters.startDate}`;
    if (activeFilters.endDate) return `Up to ${activeFilters.endDate}`;
    return 'All Loaded Dates';
  }, [activeFilters.startDate, activeFilters.endDate]);

  const whatsappText = useMemo(() => {
    const lines: string[] = [
      `*BLINKIT EXECUTIVE SUMMARY*`,
      `Period: ${periodLabel}`,
      `Brand: ${activeFilters.brand} | Warehouse: ${activeFilters.warehouse}`,
      ``,
      `*KEY METRICS*`,
      `• Gross Revenue: *${formatINR(totalRevenue)}*`,
      `• Units Sold: *${totalUnitsSold.toLocaleString()}*`,
      `• Avg Selling Price (ASP): *₹${averageASP.toFixed(0)}*`,
      `• Active Sellable Stock: *${totalSellable.toLocaleString()} units*`,
      `• Unsellable Stock: *${totalUnsellable.toLocaleString()} units*`,
      `• Stock Alerts: *${stockoutCount} Stockout* | *${lowStockCount} Low Stock*`,
    ];

    if (adsStats.hasAds) {
      lines.push(
        ``,
        `*ADS & TACoS*`,
        `• Ad Spend: *${formatINR(adsStats.spend)}*`,
        `• Ad Sales: *${formatINR(adsStats.sales)}* (${adsStats.roas.toFixed(2)}x ROAS)`,
        `• TACoS: *${adsStats.tacos.toFixed(1)}%*`
      );
    }

    if (topProducts.length > 0) {
      lines.push(``, `*TOP 5 PRODUCTS*`);
      topProducts.slice(0, 5).forEach((p, idx) => {
        lines.push(`${idx + 1}. ${p.fullName.substring(0, 38)} — ${p.qty} units (${formatINR(p.revenue)})`);
      });
    }

    if (topCities.length > 0) {
      lines.push(``, `*TOP 5 CITIES*`);
      topCities.slice(0, 5).forEach((c, idx) => {
        lines.push(`${idx + 1}. ${c.name} — ${c.quantity.toLocaleString()} units (${formatINR(c.revenue)})`);
      });
    }

    return lines.join('\n');
  }, [
    periodLabel,
    activeFilters.brand,
    activeFilters.warehouse,
    totalRevenue,
    totalUnitsSold,
    averageASP,
    totalSellable,
    totalUnsellable,
    stockoutCount,
    lowStockCount,
    adsStats,
    topProducts,
    topCities,
  ]);

  const handleCopyWhatsApp = async () => {
    try {
      await navigator.clipboard.writeText(whatsappText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback textarea copy
      const ta = document.createElement('textarea');
      ta.value = whatsappText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Header Banner
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 26, 'F');
    doc.setTextColor(250, 204, 21);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('BLINKIT SELLER EXECUTIVE REPORT', 14, 12);

    doc.setTextColor(226, 232, 240);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Period: ${periodLabel}   |   Brand: ${activeFilters.brand}   |   Warehouse: ${activeFilters.warehouse}`,
      14,
      19
    );
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 165, 19);

    // KPI Summary Table
    const kpiRows = [
      ['Gross Sales Revenue', formatPlainINR(totalRevenue), 'Total Units Sold', totalUnitsSold.toLocaleString()],
      ['Average Selling Price (ASP)', `Rs. ${averageASP.toFixed(0)}`, 'Sellable Inventory', `${totalSellable.toLocaleString()} units`],
      ['Unsellable Stock', `${totalUnsellable.toLocaleString()} units`, 'Stockout / Low SKUs', `${stockoutCount} Stockout / ${lowStockCount} Low`],
    ];
    if (adsStats.hasAds) {
      kpiRows.push([
        'Total Ad Spend',
        formatPlainINR(adsStats.spend),
        'Ad ROAS / TACoS',
        `${adsStats.roas.toFixed(2)}x ROAS (${adsStats.tacos.toFixed(1)}% TACoS)`,
      ]);
    }

    autoTable(doc, {
      startY: 32,
      head: [['Performance Metric', 'Value', 'Inventory / Ads Metric', 'Value']],
      body: kpiRows,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: {
        1: { fontStyle: 'bold' },
        3: { fontStyle: 'bold' },
      },
    });

    const afterKpiY = (doc as any).lastAutoTable.finalY + 7;

    // Top 5 Products Table
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Top 5 Revenue Products', 14, afterKpiY);

    autoTable(doc, {
      startY: afterKpiY + 3,
      head: [['#', 'Product Name', 'Units Sold', 'ASP', 'Revenue']],
      body: topProducts.slice(0, 5).map((p, idx) => [
        String(idx + 1),
        p.fullName.substring(0, 55),
        p.qty.toLocaleString(),
        `Rs. ${p.asp.toFixed(0)}`,
        formatPlainINR(p.revenue),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
    });

    const afterProductsY = (doc as any).lastAutoTable.finalY + 7;

    // Top 5 Cities Table
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Top Performing Cities', 14, afterProductsY);

    autoTable(doc, {
      startY: afterProductsY + 3,
      head: [['#', 'City', 'Units Sold', 'Revenue']],
      body: topCities.slice(0, 5).map((c, idx) => [
        String(idx + 1),
        c.name,
        c.quantity.toLocaleString(),
        formatPlainINR(c.revenue),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [139, 92, 246], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
    });

    doc.save(`Blinkit_Executive_Summary_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-700 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-400 text-slate-900 rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Executive Summary Report</h3>
              <p className="text-xs text-slate-300">
                1-Page PDF Export &amp; WhatsApp-ready Summary ({periodLabel})
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Preview */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          {/* Quick Visual Snapshot */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-100 dark:border-slate-700">
              <p className="text-[11px] text-gray-500">Revenue</p>
              <p className="text-base font-extrabold text-gray-900 dark:text-white">{formatINR(totalRevenue)}</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-100 dark:border-slate-700">
              <p className="text-[11px] text-gray-500">Units Sold</p>
              <p className="text-base font-extrabold text-gray-900 dark:text-white">{totalUnitsSold.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-100 dark:border-slate-700">
              <p className="text-[11px] text-gray-500">Sellable Stock</p>
              <p className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">{totalSellable.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-100 dark:border-slate-700">
              <p className="text-[11px] text-gray-500">Stockout / Low</p>
              <p className="text-base font-extrabold text-red-600 dark:text-red-400">
                {stockoutCount} / {lowStockCount}
              </p>
            </div>
          </div>

          {/* WhatsApp Text Preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 uppercase tracking-wide">
                <MessageSquare className="w-4 h-4 text-green-600" />
                WhatsApp Formatted Summary
              </label>
              <button
                onClick={handleCopyWhatsApp}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-green-100 hover:bg-green-200 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied for WhatsApp!' : 'Copy Summary'}
              </button>
            </div>
            <pre className="p-4 bg-slate-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto custom-scrollbar">
              {whatsappText}
            </pre>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/60 flex flex-wrap justify-end items-center gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleCopyWhatsApp}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
          >
            {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy WhatsApp Text'}
          </button>
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-1.5 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-slate-900 rounded-lg text-xs font-bold shadow-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            Download 1-Page PDF
          </button>
        </div>
      </div>
    </div>
  );
};
