/**
 * Advanced Arabic RTL Text Direction Corrector for Chrome Extensions
 * Intelligently detects and applies RTL styling to Arabic content
 *
 * Features:
 * - Comprehensive Arabic script detection
 * - Performance optimized with debouncing and caching
 * - Handles dynamic content with MutationObserver
 * - Shadow DOM support
 * - Mixed content handling
 * - Iframe support with proper permissions
 *
 * @author Chrome Extension Developer
 * @version 2.1.0
 */

class ArabicRTLCorrector {
  constructor(options = {}) {
    // Configuration options
    this.config = {
      arabicThreshold: options.arabicThreshold || 0.3,
      debounceDelay: options.debounceDelay || 150,
      enableVisualFeedback: options.enableVisualFeedback !== false,
      enableIframeHandling: options.enableIframeHandling !== false,
      batchSize: options.batchSize || 30,
      maxProcessingTime: options.maxProcessingTime || 16, // ~60fps
      ...options,
    };

    // Performance optimization caches
    this.processedElements = new WeakSet();
    this.textCache = new WeakMap();
    this.debounceTimer = null;
    this.observer = null;
    this.isEnabled = true;
    this.isProcessing = false;

    // Target element selectors
    this.targetSelectors = [
      "p",
      "span",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      'input:not([type="password"]):not([type="email"]):not([type="url"])',
      "textarea",
      '[contenteditable="true"]',
      '[contenteditable=""]',
      "label",
      "button",
      "a",
      "li",
      "td",
      "th",
    ];

    // Elements to skip
    this.skipSelectors = [
      "code",
      "pre",
      "script",
      "style",
      "noscript",
      "div",
      "[data-rtl-skip]",
      ".rtl-skip",
      'input[type="password"]',
      'input[type="email"]',
      'input[type="url"]',
    ];

    // Comprehensive Arabic Unicode ranges
    this.arabicRegex =
      /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;

    // Latin numbers and URLs to preserve LTR
    this.ltrPreserveRegex = /[0-9]+|https?:\/\/[^\s]+|www\.[^\s]+/g;

    // Bound methods for event listeners
    this.handleDOMContentLoaded = this.handleDOMContentLoaded.bind(this);
    this.handleMutations = this.handleMutations.bind(this);

    this.init();
  }

  /**
   * Initialize the RTL corrector
   */
  init() {
    try {
      // Wait for DOM to be ready
      if (document.readyState === "loading") {
        document.addEventListener(
          "DOMContentLoaded",
          this.handleDOMContentLoaded
        );
      } else {
        this.handleDOMContentLoaded();
      }
    } catch (error) {
      console.error("Error initializing ArabicRTLCorrector:", error);
    }
  }

  /**
   * Handle DOM content loaded
   */
  handleDOMContentLoaded() {
    try {
      // Initial DOM scan
      this.scanDOM();

      // Set up mutation observer for dynamic content
      this.setupMutationObserver();

      // Handle iframes if enabled
      if (this.config.enableIframeHandling) {
        this.handleIframes();
      }

      console.log("ArabicRTLCorrector initialized successfully");
    } catch (error) {
      console.error("Error in handleDOMContentLoaded:", error);
    }
  }

  /**
   * Set up mutation observer for dynamic content
   */
  setupMutationObserver() {
    if (this.observer) {
      this.observer.disconnect();
    }

    try {
      this.observer = new MutationObserver(this.handleMutations);
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["value", "placeholder", "contenteditable"],
      });
    } catch (error) {
      console.error("Error setting up MutationObserver:", error);
    }
  }

  /**
   * Handle mutations with debouncing
   */
  handleMutations(mutations) {
    if (!this.isEnabled || this.isProcessing) return;

    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.processMutations(mutations);
    }, this.config.debounceDelay);
  }

  /**
   * Process mutations
   */
  processMutations(mutations) {
    const elementsToProcess = new Set();

    mutations.forEach((mutation) => {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            elementsToProcess.add(node);
            // Also check child elements
            const children = this.getTargetElements(node);
            children.forEach((child) => elementsToProcess.add(child));
          }
        });
      } else if (
        mutation.type === "characterData" ||
        mutation.type === "attributes"
      ) {
        const target = mutation.target;
        if (target.nodeType === Node.ELEMENT_NODE) {
          // Clear cache for modified elements
          this.textCache.delete(target);
          this.processedElements.delete(target);
          elementsToProcess.add(target);
        } else if (target.parentElement) {
          // Text node changed, check parent
          this.textCache.delete(target.parentElement);
          this.processedElements.delete(target.parentElement);
          elementsToProcess.add(target.parentElement);
        }
      }
    });

    if (elementsToProcess.size > 0) {
      this.processElementsBatch(Array.from(elementsToProcess));
    }
  }

  /**
   * Handle iframes
   */
  handleIframes() {
    try {
      const iframes = document.querySelectorAll("iframe");
      iframes.forEach((iframe) => {
        try {
          // Only process same-origin iframes
          if (!iframe.contentDocument) return;

          const iframeCorrector = new ArabicRTLCorrector({
            ...this.config,
            enableIframeHandling: false, // Prevent infinite recursion
          });

          iframe.addEventListener("load", () => {
            if (iframe.contentDocument) {
              iframeCorrector.scanDOM(iframe.contentDocument);
            }
          });
        } catch (error) {
          // Ignore cross-origin iframe errors
          console.debug(
            "Cannot access iframe content (likely cross-origin):",
            error
          );
        }
      });
    } catch (error) {
      console.error("Error handling iframes:", error);
    }
  }

  /**
   * Scan the entire DOM for Arabic content
   * @param {Document|Element} root - Root element to scan from
   */
  scanDOM(root = document) {
    if (!this.isEnabled || this.isProcessing) return;

    try {
      const elements = this.getTargetElements(root);
      this.processElementsBatch(elements);
    } catch (error) {
      console.error("Error scanning DOM:", error);
    }
  }

  /**
   * Process elements in batches for better performance
   * @param {Array} elements - Elements to process
   */
  processElementsBatch(elements) {
    if (!elements.length || this.isProcessing) return;

    this.isProcessing = true;
    let currentIndex = 0;

    const processChunk = () => {
      const startTime = performance.now();

      while (
        currentIndex < elements.length &&
        performance.now() - startTime < this.config.maxProcessingTime
      ) {
        const element = elements[currentIndex];
        if (element && element.isConnected) {
          // Check if element is still in DOM
          this.processElement(element);
        }
        currentIndex++;
      }

      if (currentIndex < elements.length) {
        // Schedule next chunk
        requestAnimationFrame(processChunk);
      } else {
        this.isProcessing = false;
      }
    };

    requestAnimationFrame(processChunk);
  }

  /**
   * Get target elements for processing
   * @param {Document|Element} root - Root element
   * @returns {Array} Array of elements to process
   */
  getTargetElements(root) {
    try {
      const selector = this.targetSelectors.join(",");
      const elements = Array.from(root.querySelectorAll(selector));

      // Filter out elements that should be skipped
      return elements.filter((el) => {
        try {
          // Skip if matches skip selectors
          if (this.skipSelectors.some((skipSel) => el.matches(skipSel))) {
            return false;
          }

          // Skip if not visible
          if (!this.isElementVisible(el)) {
            return false;
          }

          // Skip if already processed and content hasn't changed
          if (this.processedElements.has(el) && this.textCache.has(el)) {
            const currentText = this.getElementText(el);
            const cachedText = this.textCache.get(el);
            if (currentText === cachedText) {
              return false;
            }
          }

          return true;
        } catch (error) {
          console.error("Error filtering element:", error);
          return false;
        }
      });
    } catch (error) {
      console.error("Error getting target elements:", error);
      return [];
    }
  }

  /**
   * Check if element is visible
   * @param {Element} element - Element to check
   * @returns {boolean} True if element is visible
   */
  isElementVisible(element) {
    try {
      if (
        !element.offsetParent &&
        element.offsetHeight === 0 &&
        element.offsetWidth === 0
      ) {
        return false;
      }

      const style = window.getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0"
      );
    } catch (error) {
      console.error("Error checking element visibility:", error);
      return true; // Default to visible if check fails
    }
  }

  /**
   * Process individual element for Arabic content
   * @param {Element} element - Element to process
   */
  processElement(element) {
    try {
      if (!element || !element.isConnected) return;

      const text = this.getElementText(element);

      if (!text || text.trim().length < 3) {
        return;
      }

      const arabicRatio = this.calculateArabicRatio(text);

      // Always check span, h1, a, and p for Arabic and apply RTL if needed
      if (
        ["SPAN", "H1", "A", "P"].includes(element.tagName) &&
        arabicRatio > 0
      ) {
        this.applyRTLStyles(element, arabicRatio);
      } else if (arabicRatio >= this.config.arabicThreshold) {
        this.applyRTLStyles(element, arabicRatio);
      }

      // Mark as processed
      this.processedElements.add(element);
    } catch (error) {
      console.error("Error processing element:", error, element);
    }
  }

  /**
   * Get text content from element based on its type
   * @param {Element} element - Element to extract text from
   * @returns {string} Text content
   */
  getElementText(element) {
    try {
      let text = "";

      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        text = (element.value || "") + " " + (element.placeholder || "");
      } else if (element.hasAttribute("contenteditable")) {
        text = element.textContent || element.innerText || "";
      } else {
        // For regular elements, get direct text content only
        text = element.textContent || element.innerText || "";
      }

      // Cache the result
      this.textCache.set(element, text);
      return text;
    } catch (error) {
      console.error("Error getting element text:", error);
      return "";
    }
  }

  /**
   * Calculate the ratio of Arabic characters in text
   * @param {string} text - Text to analyze
   * @returns {number} Ratio of Arabic characters (0-1)
   */
  calculateArabicRatio(text) {
    try {
      if (!text || text.trim().length === 0) return 0;

      // Remove whitespace, punctuation, and LTR preserve patterns
      const cleanText = text
        .replace(/\s+/g, "") // Remove whitespace
        .replace(this.ltrPreserveRegex, "") // Remove numbers and URLs
        .replace(/[^\p{L}]/gu, ""); // Keep only letters

      if (cleanText.length === 0) return 0;

      const arabicMatches = cleanText.match(this.arabicRegex) || [];
      return arabicMatches.length / cleanText.length;
    } catch (error) {
      console.error("Error calculating Arabic ratio:", error);
      return 0;
    }
  }

  /**
   * Apply RTL styles to an element
   * @param {Element} element - Element to style
   * @param {number} arabicRatio - Ratio of Arabic content
   */
  applyRTLStyles(element, arabicRatio) {
    try {
      // Don't override explicit LTR direction
      if (
        element.hasAttribute("dir") &&
        element.getAttribute("dir").toLowerCase() === "ltr"
      ) {
        return;
      }

      // Skip if already has RTL applied with same ratio
      const existingRatio = element.getAttribute("data-arabic-ratio");
      if (
        existingRatio &&
        Math.abs(parseFloat(existingRatio) - arabicRatio) < 0.01
      ) {
        return;
      }

      // Apply RTL styling
      // Only apply direction for text elements, not for div
      const tagName = element.tagName;
      const styles = {
        textAlign: this.getBestTextAlign(element),
        unicodeBidi: arabicRatio > 0.7 ? "bidi-override" : "plaintext",
      };
      if (tagName !== "DIV") {
        styles.direction = "rtl";
        styles.unicodeBidi = "embed"; 
        styles.textAlign = 'right';
      }

      // Add smooth transition only if visual feedback is enabled
      if (this.config.enableVisualFeedback) {
        styles.transition = "all 0.3s ease";
      }

      Object.assign(element.style, styles);

      element.setAttribute("data-rtl-applied", "true");
      element.setAttribute("data-arabic-ratio", arabicRatio.toFixed(2));
    } catch (error) {
      console.error("Error applying RTL styles:", error, element);
    }
  }

  /**
   * Determine the best text alignment for the element
   * @param {Element} element
   * @returns {string}
   */
  getBestTextAlign(element) {
    try {
      const tagName = element.tagName;

      if (tagName === "BUTTON") return "center";
      if (["TD", "TH"].includes(tagName)) return "inherit";
      if (
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        element.hasAttribute("contenteditable")
      ) {
        return "right";
      }
      return "right";
    } catch (error) {
      console.error("Error determining text alignment:", error);
      return "right";
    }
  }

  /**
   * Remove RTL styling from all processed elements
   */
  removeAllRTLStyles() {
    try {
      const rtlElements = document.querySelectorAll(
        '[data-rtl-applied="true"]'
      );
      rtlElements.forEach((element) => {
        element.style.direction = "";
        element.style.textAlign = "";
        element.style.unicodeBidi = "";
        element.style.transition = "";
        element.removeAttribute("data-rtl-applied");
        element.removeAttribute("data-arabic-ratio");
        this.processedElements.delete(element);
        this.textCache.delete(element);
      });
    } catch (error) {
      console.error("Error removing RTL styles:", error);
    }
  }

  /**
   * Enable the RTL corrector
   */
  enable() {
    this.isEnabled = true;
    this.scanDOM();
    console.log("ArabicRTLCorrector enabled");
  }

  /**
   * Disable the RTL corrector
   */
  disable() {
    this.isEnabled = false;
    this.isProcessing = false;
    clearTimeout(this.debounceTimer);
    this.removeAllRTLStyles();
    console.log("ArabicRTLCorrector disabled");
  }

  /**
   * Destroy the corrector and clean up resources
   */
  destroy() {
    this.disable();

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // Clean up event listeners
    document.removeEventListener(
      "DOMContentLoaded",
      this.handleDOMContentLoaded
    );

    clearTimeout(this.debounceTimer);
    this.processedElements = new WeakSet();
    this.textCache = new WeakMap();

    console.log("ArabicRTLCorrector destroyed");
  }

  /**
   * Get statistics about processed elements
   * @returns {Object} Statistics object
   */
  getStats() {
    try {
      const rtlElements = document.querySelectorAll(
        '[data-rtl-applied="true"]'
      );
      const stats = {
        totalProcessed: rtlElements.length,
        averageArabicRatio: 0,
        elementTypes: {},
      };

      let totalRatio = 0;
      rtlElements.forEach((element) => {
        const ratio =
          parseFloat(element.getAttribute("data-arabic-ratio")) || 0;
        totalRatio += ratio;

        const tagName = element.tagName.toLowerCase();
        stats.elementTypes[tagName] = (stats.elementTypes[tagName] || 0) + 1;
      });

      stats.averageArabicRatio =
        rtlElements.length > 0
          ? parseFloat((totalRatio / rtlElements.length).toFixed(2))
          : 0;

      return stats;
    } catch (error) {
      console.error("Error getting stats:", error);
      return { totalProcessed: 0, averageArabicRatio: 0, elementTypes: {} };
    }
  }
}

// Export for use in Chrome extension content scripts
if (typeof module !== "undefined" && module.exports) {
  module.exports = ArabicRTLCorrector;
}

// Content Script Implementation for Chrome Extension
(function () {
  "use strict";

  let rtlCorrector = null;

  // Listen for enable/disable from popup.js (uses 'muhaThinEnabled' for compatibility)
  function syncWithPopupState() {
    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.sync
    ) {
      chrome.storage.sync.get(["muhaThinEnabled"], (result) => {
        try {
          if (result.muhaThinEnabled !== false) {
            if (!rtlCorrector) {
              initializeRTLCorrector();
            } else {
              rtlCorrector.enable();
            }
          } else if (rtlCorrector) {
            rtlCorrector.disable();
          }
        } catch (error) {
          console.error("Error syncing with popup state:", error);
        }
      });

      // Listen for changes from popup.js
      chrome.storage.onChanged.addListener((changes) => {
        try {
          if (changes.muhaThinEnabled) {
            if (changes.muhaThinEnabled.newValue) {
              if (!rtlCorrector) {
                initializeRTLCorrector();
              } else {
                rtlCorrector.enable();
              }
            } else if (rtlCorrector) {
              rtlCorrector.disable();
            }
          }
        } catch (error) {
          console.error("Error handling storage change:", error);
        }
      });
    }
  }

  /**
   * Initialize the RTL corrector
   */
  function initializeRTLCorrector() {
    try {
      if (rtlCorrector) {
        rtlCorrector.destroy();
      }
      rtlCorrector = new ArabicRTLCorrector({
        arabicThreshold: 0.3,
        debounceDelay: 150,
        enableVisualFeedback: true,
        enableIframeHandling: true,
        batchSize: 50,
        maxProcessingTime: 16,
      });
    } catch (error) {
      console.error("Error initializing RTL corrector:", error);
    }
  }

  if (typeof chrome !== "undefined" && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        switch (message.action) {
          case "enable":
            if (!rtlCorrector) {
              initializeRTLCorrector();
            } else {
              rtlCorrector.enable();
            }
            sendResponse({
              success: true,
              stats: rtlCorrector ? rtlCorrector.getStats() : {},
            });
            break;
          case "disable":
            if (rtlCorrector) {
              rtlCorrector.disable();
            }
            sendResponse({ success: true });
            break;
          case "getStats":
            const stats = rtlCorrector
              ? rtlCorrector.getStats()
              : { totalProcessed: 0 };
            sendResponse({ success: true, stats });
            break;
          case "rescan":
            if (rtlCorrector && rtlCorrector.isEnabled) {
              rtlCorrector.scanDOM();
              sendResponse({ success: true, stats: rtlCorrector.getStats() });
            } else {
              sendResponse({
                success: false,
                error: "RTL corrector not initialized or disabled",
              });
            }
            break;
          default:
            sendResponse({ success: false, error: "Unknown action" });
        }
      } catch (error) {
        console.error("Error handling message:", error);
        sendResponse({ success: false, error: error.message });
      }
      return true; // Keep message channel open for async response
    });

    // Sync with popup.html/popup.js state
    syncWithPopupState();
  } else {
    // Standalone usage (non-extension)
    initializeRTLCorrector();
  }

  // Global access for debugging
  window.ArabicRTLCorrector = ArabicRTLCorrector;
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "rtlCorrector", {
      get: () => rtlCorrector,
      configurable: true,
    });
  }
})();

/*
 * Example Usage:
 *
 * // Basic usage
 * const corrector = new ArabicRTLCorrector();
 *
 * // Custom configuration
 * const corrector = new ArabicRTLCorrector({
 *   arabicThreshold: 0.4,
 *   debounceDelay: 200,
 *   enableVisualFeedback: false,
 *   batchSize: 30,
 *   maxProcessingTime: 10
 * });
 *
 * // Manual control
 * corrector.scanDOM();
 * corrector.disable();
 * corrector.enable();
 * corrector.destroy();
 *
 * // Get statistics
 * const stats = corrector.getStats();
 * console.log('Processed elements:', stats.totalProcessed);
 * console.log('Average Arabic ratio:', stats.averageArabicRatio);
 */
