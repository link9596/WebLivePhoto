//unspport aspect-ratio browser
(function() {
    function addPaddingTopFallback() {
        var containers = document.querySelectorAll('.live-photo');
        for (var i = 0; i < containers.length; i++) {
            var container = containers[i];
            if (container._paddingFallbackAdded) continue;
            var style = container.getAttribute('style') || '';
            var match = style.match(/aspect-ratio:\s*([\d\.]+\s*\/\s*[\d\.]+)/i);
            if (match) {
                var ratio = match[1];
                var parts = ratio.split('/');
                var w = parseFloat(parts[0]);
                var h = parseFloat(parts[1]);
                if (!isNaN(w) && !isNaN(h) && w > 0) {
                    var paddingTop = (h / w) * 100 + '%';
                    if (style.indexOf('padding-top') === -1) {
                        var newStyle = style.trim();
                        if (newStyle && !newStyle.endsWith(';')) newStyle += ';';
                        newStyle += ' padding-top: ' + paddingTop + ';';
                        container.setAttribute('style', newStyle);
                    }
                }
            }
            container._paddingFallbackAdded = true;
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addPaddingTopFallback);
    } else {
        addPaddingTopFallback();
    }
})();

/**
 * WebLivePhoto Kit
 * 
 *   1. HTML ：
 *      <div class="live-photo" id="myLivePhoto">
 *          <img class="live-photo-img" src="cover.jpg" alt="...">
 *          <video class="live-photo-video" playsinline muted preload="auto">
 *              <source src="video.mp4" type="video/mp4">
 *          </video>
 *      </div>
 *   2. use javascript LivePhoto.init() or LivePhoto.init('.live-photo') to initialize.
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LivePhoto = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    class LivePhotoInstance {
        constructor(container, options = {}) {
            this.container = container;
            this.imgEl = container.querySelector('.live-photo-img');
            this.videoEl = container.querySelector('.live-photo-video');
            if (!this.imgEl || !this.videoEl) {
                throw new Error('LivePhoto Error: .live-photo-img or .live-photo-video not found');
            }

            this.options = Object.assign({
                longPressDelay: 150,
                endThreshold: 0.6,
                autoEndOnFinish: true,
                moveCancelThreshold: 10,
                fakeSchedule: [
                    { delay: 200, target: 0.1 },
                    { delay: 500, target: 0.2 },
                    { delay: 600, target: 0.25 },
                    { delay: 800, target: 0.3 },
                    { delay: 1000, target: 0.4 },
                    { delay: 2100, target: 0.55 },
                    { delay: 3500, target: 0.65 },
                    { delay: 8800, target: 0.8 }
                ],
                progressStrokeWidth: 4,
                timeoutMs: 20000
            }, options);

            this._initBadge();
            this._initVideo();
            this._bindEvents();
        }

        _detectMobile() {
            return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
                ('ontouchstart' in window) ||
                (navigator.maxTouchPoints > 0);
        }

        _initBadge() {
            const isMobile = this._detectMobile();
            this.isMobile = isMobile;

            const badge = document.createElement('div');
            badge.className = 'live-photo-badge';
            badge.innerHTML = `
                <div class="live-photo-icon">
                    <svg class="live-photo-icon-svg normal-icon" viewBox="0 0 64 64" fill="none">
                        <circle id="middleCircle" cx="32" cy="32" r="16" stroke="rgba(0,0,0,0.6)" fill="none"/>
                        <polygon points="39,32 28,24 28,40" fill="#000000" />
                        <g transform="rotate(-90 32 32)">
                            <circle id="progressCircle" class="live-photo-progress-ring" cx="32" cy="32" r="26"
                                    stroke="rgba(0,0,0,0.7)" fill="none" stroke-linecap="round"/>
                        </g>
                    </svg>
                    <svg class="live-photo-icon-svg live-photo-disabled-icon" viewBox="0 0 64 64" fill="none">
                        <circle cx="32" cy="32" r="26" stroke="rgba(0,0,0,0.8)" stroke-width="4" fill="none"/>
                        <line x1="15" y1="15" x2="49" y2="49" stroke="rgba(0,0,0,0.8)" stroke-width="4" stroke-linecap="round"/>
                    </svg>
                </div>
                <span class="live-photo-text">实况</span>
            `;
            this.container.appendChild(badge);

            this.progressCircle = badge.querySelector('#progressCircle');
            this.middleCircle = badge.querySelector('#middleCircle');
            this.normalIcon = badge.querySelector('.normal-icon');
            this.disabledIcon = badge.querySelector('.live-photo-disabled-icon');

            if (this.isMobile) {
                this.middleCircle.setAttribute('stroke-width', '3');
                this.normalStrokeWidth = 4;
                this.dotCount = 26;
            } else {
                this.middleCircle.setAttribute('stroke-width', '5');
                this.normalStrokeWidth = 8;
                this.dotCount = 16;
            }
            this.circumference = 2 * Math.PI * 26;
            this.dotSpacing = this.circumference / this.dotCount;
            this._setDotPattern();
        }

        _initVideo() {
            this.videoEl.setAttribute('playsinline', '');
            this.videoEl.setAttribute('webkit-playsinline', '');
            this.videoEl.setAttribute('x5-playsinline', '');
            this.videoEl.muted = true;
            this.videoEl.playsInline = true;
            this.videoEl.preload = 'auto';
            this.videoEl.loop = false;

            this.isPlaying = false;
            this.longPressTimer = null;
            this.isEndingGracefully = false;
            this.touchStartX = 0;
            this.touchStartY = 0;
            this.progressMode = false;
            this.fakeSteps = null;
            this.loadFailed = false;
            this.loadTimeout = null;

            this.videoEl.addEventListener('error', (e) => {
                console.warn('LivePhoto: video error', e);
                this._markAsFailed();
            });

            const onSuccess = () => {
                if (this.loadTimeout) {
                    clearTimeout(this.loadTimeout);
                    this.loadTimeout = null;
                }
                if (this.progressMode && !this.loadFailed) {
                    this._stopAllFakeProgress();
                    this.progressMode = false;
                    this._setDotPattern();
                }
            };
            this.videoEl.addEventListener('canplay', onSuccess);
            this.videoEl.addEventListener('loadeddata', onSuccess);
            this.videoEl.addEventListener('loadedmetadata', onSuccess);

            this.videoEl.addEventListener('progress', () => this._onRealProgress());
            this.videoEl.addEventListener('timeupdate', () => {
                if (!this.isPlaying || this.isEndingGracefully || this.loadFailed) return;
                const duration = this.videoEl.duration;
                if (isNaN(duration)) return;
                if (duration - this.videoEl.currentTime <= this.options.endThreshold) {
                    this._endGracefully();
                }
            });
            this.videoEl.addEventListener('ended', () => {
                if (this.isPlaying && !this.isEndingGracefully && !this.loadFailed) this._endGracefully();
            });
        }

        _markAsFailed() {
            if (this.loadFailed) return;
            this.loadFailed = true;
            if (this.normalIcon) this.normalIcon.style.display = 'none';
            if (this.disabledIcon) this.disabledIcon.style.display = 'block';
            this._stopAllFakeProgress();
            if (this.loadTimeout) {
                clearTimeout(this.loadTimeout);
                this.loadTimeout = null;
            }
            this.progressMode = false;
            if (this.isPlaying) this.stop();
            this.container.classList.remove('live-photo--loading');
            this.container.classList.remove('is-playing');
        }

        _startLoadTimeout() {
            if (this.options.timeoutMs <= 0) return;
            if (this.loadTimeout) clearTimeout(this.loadTimeout);
            this.loadTimeout = setTimeout(() => {
                if (!this.loadFailed && this.videoEl.readyState < 2) {
                    console.warn('LivePhoto: video loading timeout, cannot play');
                    this._markAsFailed();
                }
            }, this.options.timeoutMs);
        }

        _getRealBufferedPercent() {
            if (!this.videoEl.duration || isNaN(this.videoEl.duration)) return 0;
            const buffered = this.videoEl.buffered;
            if (buffered.length === 0) return 0;
            const end = buffered.end(buffered.length - 1);
            return Math.min(1, Math.max(0, end / this.videoEl.duration));
        }

        _setProgress(percent) {
            if (!this.progressCircle || this.loadFailed) return;
            const offset = this.circumference * (1 - percent);
            this.progressCircle.style.strokeDashoffset = offset;
        }

        _setDotPattern() {
            if (!this.progressCircle || this.loadFailed) return;
            this.progressCircle.setAttribute('stroke-dasharray', `0 ${this.dotSpacing}`);
            this.progressCircle.style.strokeDashoffset = '';
            this.progressCircle.setAttribute('stroke', 'rgba(0,0,0,0.7)');
            this.progressCircle.setAttribute('stroke-width', this.normalStrokeWidth);
        }

        _enableProgressMode() {
            if (!this.progressCircle || this.loadFailed) return;
            this.progressCircle.setAttribute('stroke-dasharray', `${this.circumference}`);
            this.progressCircle.setAttribute('stroke', '#000000');
            this.progressCircle.setAttribute('stroke-width', this.options.progressStrokeWidth);
        }

        _onRealProgress() {
            if (!this.progressMode || this.loadFailed) return;
            const realPercent = this._getRealBufferedPercent();
            if (this.fakeSteps && this.fakeSteps.length > 0) {
                let currentOffset = parseFloat(this.progressCircle.style.strokeDashoffset);
                if (isNaN(currentOffset)) currentOffset = this.circumference;
                let currentPercent = (this.circumference - currentOffset) / this.circumference;
                if (realPercent > currentPercent) {
                    this._stopAllFakeProgress();
                    this._setProgress(realPercent);
                }
            } else {
                this._setProgress(realPercent);
            }
        }

        _startFakeProgress() {
            if (this.fakeSteps && this.fakeSteps.length > 0) return;
            if (this.loadFailed) return;
            this._enableProgressMode();
            this._setProgress(0);
            const schedule = this.options.fakeSchedule;
            this.fakeSteps = [];
            for (let i = 0; i < schedule.length; i++) {
                const step = schedule[i];
                const timer = setTimeout(() => {
                    if (this.loadFailed) return;
                    const realPercent = this._getRealBufferedPercent();
                    if (realPercent >= step.target) {
                        this._stopAllFakeProgress();
                        this._setProgress(realPercent);
                        return;
                    }
                    this._setProgress(step.target);
                    if (step.target === 0.8) {
                        this.fakeSteps = null;
                    }
                }, step.delay);
                this.fakeSteps.push(timer);
            }
        }

        _stopAllFakeProgress() {
            if (this.fakeSteps) {
                for (let timer of this.fakeSteps) clearTimeout(timer);
                this.fakeSteps = null;
            }
        }

        _preloadVideo() {
            if (this.loadFailed) return;
            if (this.videoEl.readyState >= 2) return;
            if (!this.progressMode) {
                this.progressMode = true;
                this._startFakeProgress();
            }
            if (this.videoEl.readyState === 0) {
                this.videoEl.load();
                this._startLoadTimeout();
            }
        }

        _endGracefully() {
            if (this.isEndingGracefully || this.loadFailed) return;
            this.isEndingGracefully = true;
            this.container.classList.remove('is-playing');
            this.videoEl.pause();
            const onTransitionEnd = () => {
                this.videoEl.currentTime = 0;
                this.isPlaying = false;
                this.isEndingGracefully = false;
                this.videoEl.removeEventListener('transitionend', onTransitionEnd);
            };
            this.videoEl.addEventListener('transitionend', onTransitionEnd, { once: true });
            setTimeout(() => {
                if (this.isEndingGracefully) {
                    this.videoEl.currentTime = 0;
                    this.isPlaying = false;
                    this.isEndingGracefully = false;
                }
            }, 500);
        }

        start() {
            if (this.isPlaying || this.isEndingGracefully || this.loadFailed) return;
            if (this.videoEl.readyState < 2) {
                this._preloadVideo();
                this.videoEl.addEventListener('canplay', () => this._doStart(), { once: true });
                return;
            }
            this._doStart();
        }

        _doStart() {
            if (this.loadFailed) return;
            this.isPlaying = true;
            this.videoEl.currentTime = 0;
            this.container.classList.add('is-playing');
            this.videoEl.play().catch(e => {
                console.warn('LivePhoto: play failed', e);
                this.stop();
            });
        }

        stop() {
            if ((!this.isPlaying && !this.isEndingGracefully) || this.loadFailed) return;
            if (this.isEndingGracefully) this.isEndingGracefully = false;
            this.isPlaying = false;
            this.container.classList.remove('is-playing');
            if (!this.videoEl.paused) this.videoEl.pause();
        }

        _onTouchStart(e) {
            if (this.loadFailed) return;
            this.touchStartX = e.touches[0].clientX;
            this.touchStartY = e.touches[0].clientY;
            this._preloadVideo();
            this._startLongPressTimer();
        }

        _onTouchMove(e) {
            if (this.longPressTimer && this._isTouchMoved(e)) this._clearLongPressTimer();
        }

        _onTouchEnd(e) {
            if (this.loadFailed) return;
            this._clearLongPressTimer();
            if (this.isPlaying) this.stop();
        }

        _onTouchCancel(e) {
            if (this.loadFailed) return;
            this._clearLongPressTimer();
            if (this.isPlaying) this.stop();
        }

        _isTouchMoved(e) {
            const dx = Math.abs(e.touches[0].clientX - this.touchStartX);
            const dy = Math.abs(e.touches[0].clientY - this.touchStartY);
            return (dx > this.options.moveCancelThreshold || dy > this.options.moveCancelThreshold);
        }

        _startLongPressTimer() {
            this._clearLongPressTimer();
            this.longPressTimer = setTimeout(() => this.start(), this.options.longPressDelay);
        }

        _clearLongPressTimer() {
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
        }

        _bindEvents() {
            this.container.addEventListener('mouseenter', () => this.start());
            this.container.addEventListener('mouseleave', () => this.stop());
            this.container.addEventListener('touchstart', this._onTouchStart.bind(this), { passive: true });
            this.container.addEventListener('touchmove', this._onTouchMove.bind(this), { passive: true });
            this.container.addEventListener('touchend', this._onTouchEnd.bind(this));
            this.container.addEventListener('touchcancel', this._onTouchCancel.bind(this));
        }

        destroy() {
            this._clearLongPressTimer();
            this._stopAllFakeProgress();
            if (this.loadTimeout) {
                clearTimeout(this.loadTimeout);
                this.loadTimeout = null;
            }
            const badge = this.container.querySelector('.live-photo-badge');
            if (badge) badge.remove();
            this.container.classList.remove('is-playing');
        }
    }

    class LivePhoto {
        static init(selector = '.live-photo', options = {}) {
            let containers;
            if (typeof selector === 'string') {
                containers = document.querySelectorAll(selector);
            } else if (selector instanceof HTMLElement) {
                containers = [selector];
            } else if (selector instanceof NodeList) {
                containers = Array.from(selector);
            } else {
                throw new Error('LivePhoto.init: invalid selector');
            }
            const instances = [];
            for (let container of containers) {
                if (container.querySelector('.live-photo-badge')) {
                    console.warn('LivePhoto: already initialized on this container', container);
                    continue;
                }
                try {
                    const instance = new LivePhotoInstance(container, options);
                    instances.push(instance);
                } catch (err) {
                    console.error('LivePhoto initialize faild:', err);
                }
            }
            return instances;
        }
    }

    return LivePhoto;
}));
