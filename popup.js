/**
 * Enhanced Popup Controller for Arabic RTL Extension
 * Handles UI interactions, state management, and communication with content scripts
 */

class PopupController {
  constructor() {
    // UI Elements
    this.elements = {
      toggleBtn: document.getElementById('toggleBtn'),
      toggleText: document.getElementById('toggleText'),
      statusDot: document.getElementById('statusDot'),
      statusText: document.getElementById('statusText'),
      loadingSpinner: document.getElementById('loadingSpinner'),
      statsGrid: document.getElementById('statsGrid'),
      processedCount: document.getElementById('processedCount'),
      arabicRatio: document.getElementById('arabicRatio'),
      rescanBtn: document.getElementById('rescanBtn'),
      settingsBtn: document.getElementById('settingsBtn'),
      helpBtn: document.getElementById('helpBtn'),
      lastUpdate: document.getElementById('lastUpdate')
    };

    // State
    this.state = {
      isEnabled: false,
      isLoading: true,
      stats: { totalProcessed: 0, averageArabicRatio: 0 },
      currentTab: null
    };

    // Localization strings
    this.strings = {
      ar: {
        enable: 'تفعيل التصحيح',
        disable: 'تعطيل التصحيح',
        enabled: 'التصحيح مُفعّل',
        disabled: 'التصحيح مُعطّل',
        loading: 'جاري التحميل...',
        processing: 'جاري المعالجة...',
        error: 'حدث خطأ',
        rescanning: 'جاري إعادة الفحص...',
        noContent: 'لا يوجد محتوى عربي',
        elementsProcessed: 'عنصر معالج',
        arabicRatio: 'نسبة العربية',
        lastUpdate: 'آخر تحديث',
        now: 'الآن',
        minutes: 'دقائق',
        minute: 'دقيقة',
        seconds: 'ثواني'
      }
    };

    this.init();
  }

  /**
   * Initialize the popup controller
   */
  async init() {
    try {
      // Set up event listeners
      this.setupEventListeners();
      
      // Get current tab
      await this.getCurrentTab();
      
      // Load initial state
      await this.loadState();
      
      // Update UI
      this.updateUI();
      
      // Set up periodic stats updates
      this.setupStatsUpdates();
      
    } catch (error) {
      console.error('Error initializing popup:', error);
      this.showError('فشل في تحميل الإضافة');
    }
  }

  /**
   * Set up event listeners for UI elements
   */
  setupEventListeners() {
    // Toggle button
    this.elements.toggleBtn.addEventListener('click', () => this.toggleExtension());
    
    // Action buttons
    this.elements.rescanBtn.addEventListener('click', () => this.rescanPage());
    this.elements.settingsBtn.addEventListener('click', () => this.openSettings());
    this.elements.helpBtn.addEventListener('click', () => this.showHelp());
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (document.activeElement === this.elements.toggleBtn) {
          e.preventDefault();
          this.toggleExtension();
        }
      }
    });

    // Storage changes listener
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.arabicRTLEnabled) {
        this.state.isEnabled = changes.arabicRTLEnabled.newValue !== false;
        this.updateUI();
      }
    });
  }

  /**
   * Get the current active tab
   */
  async getCurrentTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        this.state.currentTab = tabs[0];
        resolve(tabs[0]);
      });
    });
  }

  /**
   * Load extension state from storage
   */
  async loadState() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['arabicRTLEnabled', 'lastStatsUpdate'], (result) => {
        this.state.isEnabled = result.arabicRTLEnabled !== false;
        this.state.isLoading = false;
        
        // Get current stats
        this.getStats().then(() => {
          resolve();
        });
      });
    });
  }

  /**
   * Get statistics from content script
   */
  async getStats() {
    if (!this.state.currentTab?.id) return;

    try {
      const response = await this.sendMessageToTab('getStats');
      if (response?.success && response.stats) {
        this.state.stats = response.stats;
        this.updateStatsDisplay();
      }
    } catch (error) {
      console.debug('Could not get stats:', error);
    }
  }

  /**
   * Send message to content script
   */
  async sendMessageToTab(action, data = {}) {
    if (!this.state.currentTab?.id) {
      throw new Error('No active tab');
    }

    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(
        this.state.currentTab.id,
        { action, ...data },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  /**
   * Toggle extension on/off
   */
  async toggleExtension() {
    if (this.state.isLoading) return;

    try {
      this.setLoading(true, 'جاري المعالجة...');
      
      const newState = !this.state.isEnabled;
      
      // Update storage
      await new Promise((resolve) => {
        chrome.storage.sync.set({ arabicRTLEnabled: newState }, resolve);
      });

      // Send message to content script
      const action = newState ? 'enable' : 'disable';
      const response = await this.sendMessageToTab(action);
      
      if (response?.success) {
        this.state.isEnabled = newState;
        if (response.stats) {
          this.state.stats = response.stats;
        }
      }

      // Add haptic feedback
      this.addHapticFeedback();
      
    } catch (error) {
      console.error('Error toggling extension:', error);
      this.showError('فشل في تغيير حالة الإضافة');
    } finally {
      this.setLoading(false);
      this.updateUI();
    }
  }

  /**
   * Rescan the current page
   */
  async rescanPage() {
    try {
      this.setButtonLoading(this.elements.rescanBtn, true);
      
      const response = await this.sendMessageToTab('rescan');
      
      if (response?.success && response.stats) {
        this.state.stats = response.stats;
        this.updateStatsDisplay();
      }

      // Show success feedback
      this.showTemporaryStatus('تم إعادة الفحص بنجاح', 2000);
      
    } catch (error) {
      console.error('Error rescanning page:', error);
      this.showError('فشل في إعادة فحص الصفحة');
    } finally {
      this.setButtonLoading(this.elements.rescanBtn, false);
    }
  }

  /**
   * Open settings/options page
   */
  openSettings() {
    // For now, show a simple alert with available settings
    // In a full extension, this would open an options page
    const settingsInfo = `
الإعدادات المتاحة:
• نسبة النص العربي: 30%
• تأخير المعالجة: 150ms
• التغذية البصرية: مُفعّلة
• معالجة الإطارات: مُفعّلة

لتخصيص هذه الإعدادات، قم بتطوير صفحة خيارات منفصلة.
    `.trim();
    
    alert(settingsInfo);
  }

  /**
   * Show help information
   */
  showHelp() {
    const helpInfo = `
مُحَاذٍ - مُصحح الاتجاه العربي

الميزات:
• تصحيح اتجاه النص العربي تلقائياً
• معالجة المحتوى الديناميكي
• دعم المحتوى المختلط
• تحسين الأداء

الاستخدام:
• انقر "تفعيل التصحيح" لتشغيل الإضافة
• انقر "إعادة فحص" لمعالجة المحتوى الجديد
• الإضافة تعمل تلقائياً على الصفحات الجديدة

للدعم: تواصل مع المطور
    `.trim();
    
    alert(helpInfo);
  }

  /**
   * Update the UI based on current state
   */
  updateUI() {
    const { isEnabled, isLoading } = this.state;
    
    // Update toggle button
    this.elements.toggleBtn.disabled = isLoading;
    this.elements.toggleText.textContent = isLoading 
      ? this.strings.ar.processing
      : (isEnabled ? this.strings.ar.disable : this.strings.ar.enable);
    
    this.elements.toggleBtn.className = `toggle-button ${!isEnabled ? 'disabled' : ''}`;
    
    // Update status
    this.elements.statusDot.className = `status-dot ${isEnabled ? 'active' : 'inactive'}`;
    this.elements.statusText.textContent = isEnabled 
      ? this.strings.ar.enabled 
      : this.strings.ar.disabled;
    
    // Show/hide loading spinner
    this.elements.loadingSpinner.style.display = isLoading ? 'inline-block' : 'none';
    
    // Update stats display
    this.updateStatsDisplay();
    
    // Update last update time
    this.updateLastUpdateTime();
  }

  /**
   * Update statistics display
   */
  updateStatsDisplay() {
    const { stats } = this.state;
    
    if (stats && stats.totalProcessed > 0) {
      this.elements.processedCount.textContent = stats.totalProcessed.toLocaleString('ar');
      this.elements.arabicRatio.textContent = `${Math.round(stats.averageArabicRatio * 100)}%`;
      this.elements.statsGrid.style.display = 'grid';
    } else {
      this.elements.statsGrid.style.display = 'none';
    }
  }

  /**
   * Update last update time
   */
  updateLastUpdateTime() {
    const now = new Date();
    this.elements.lastUpdate.textContent = `${this.strings.ar.lastUpdate}: ${this.strings.ar.now}`;
  }

  /**
   * Set loading state
   */
  setLoading(loading, message = '') {
    this.state.isLoading = loading;
    if (message) {
      this.elements.statusText.textContent = message;
    }
  }

  /**
   * Set button loading state
   */
  setButtonLoading(button, loading) {
    if (loading) {
      button.style.opacity = '0.6';
      button.disabled = true;
    } else {
      button.style.opacity = '1';
      button.disabled = false;
    }
  }

  /**
   * Show temporary status message
   */
  showTemporaryStatus(message, duration = 3000) {
    const originalText = this.elements.statusText.textContent;
    this.elements.statusText.textContent = message;
    
    setTimeout(() => {
      this.elements.statusText.textContent = originalText;
    }, duration);
  }

  /**
   * Show error message
   */
  showError(message) {
    this.elements.statusText.textContent = message;
    this.elements.statusDot.className = 'status-dot inactive';
    
    // Reset after 3 seconds
    setTimeout(() => {
      this.updateUI();
    }, 3000);
  }

  /**
   * Add haptic feedback (vibration on mobile)
   */
  addHapticFeedback() {
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  }

  /**
   * Set up periodic stats updates
   */
  setupStatsUpdates() {
    // Update stats every 5 seconds when extension is active
    setInterval(() => {
      if (this.state.isEnabled && !this.state.isLoading) {
        this.getStats();
      }
    }, 5000);
  }

  /**
   * Format time ago string
   */
  formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) {
      return this.strings.ar.now;
    } else if (minutes === 1) {
      return `${this.strings.ar.minute} واحدة`;
    } else if (minutes < 60) {
      return `${minutes} ${this.strings.ar.minutes}`;
    } else {
      return this.strings.ar.now;
    }
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});

// Handle popup close/open events
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    // Popup opened - refresh stats
    if (window.popupController) {
      window.popupController.getStats();
    }
  }
});

// Export for debugging
window.PopupController = PopupController;