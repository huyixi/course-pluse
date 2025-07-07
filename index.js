// ==UserScript==
// @name         在线课程心跳
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  用户首次交互后自动执行计时、播放、评分、下一节等操作，尽可能保持学习不中断。
// @author       huyixi
// @match        *://fjjyxy.yanxiu.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  let retryCount = 0;
  let currentOperation = null;
  const MAX_RETRY_COUNT = 3;
  const CHECK_INTERVAL = 10 * 1000;
  let userInteracted = false;

  function simulateClick(el) {
    if (!el) return;
    const evt = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
    });
    el.dispatchEvent(evt);
  }

  function simulateHoverAndClick(el) {
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "center" });

    const mouseenter = new MouseEvent("mouseenter", {
      bubbles: true,
      cancelable: true,
    });
    const mouseover = new MouseEvent("mouseover", {
      bubbles: true,
      cancelable: true,
    });
    const mousedown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    const mouseup = new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
    });
    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });

    el.dispatchEvent(mouseenter);
    el.dispatchEvent(mouseover);

    setTimeout(() => {
      el.dispatchEvent(mousedown);
      el.dispatchEvent(mouseup);
      el.dispatchEvent(click);
    }, 1000);
  }

  const operations = {
    alarm: {
      label: "继续计时",
      detect: () => {
        const el = document.querySelector(".alarmClock-wrapper");
        return el && getComputedStyle(el).display !== "none" ? el : null;
      },
      act: (el) => simulateClick(el),
      success: () => {
        const el = document.querySelector(".alarmClock-wrapper");
        return !el || getComputedStyle(el).display === "none";
      },
    },
    rating: {
      label: "评分",
      detect: () => {
        const wrapper = document.querySelector("div.scoring-wrapper");
        return wrapper && getComputedStyle(wrapper).display !== "none"
          ? wrapper
          : null;
      },
      act: (wrapper) => {
        const rateItems = wrapper.querySelectorAll("span.rate-item");
        const submit = wrapper.querySelector(".commit button");

        if (!submit) return;

        if (!submit.disabled) {
          console.log(`[保活助手] 提交按钮可用，点击提交`);
          simulateHoverAndClick(submit);
        } else if (rateItems.length > 0) {
          console.log(`[保活助手] 模拟 hover + click 点击评分星星`);
          simulateHoverAndClick(rateItems[4]); // 第5颗星

          setTimeout(() => {
            simulateHoverAndClick(rateItems[3]); // 再点第4颗星
          }, 1000);

          setTimeout(() => {
            const updatedWrapper = document.querySelector(
              "div.scoring-wrapper",
            );
            const updatedSubmit =
              updatedWrapper?.querySelector(".commit button");
            if (updatedSubmit && !updatedSubmit.disabled) {
              console.log(`[保活助手] 评分后提交按钮可用，点击提交`);
              simulateHoverAndClick(updatedSubmit);
            } else {
              console.warn(`[保活助手] 提交按钮仍不可用`);
            }
          }, 1000);
        }
      },
      success: () => {
        const wrapper = document.querySelector("div.scoring-wrapper");
        return !wrapper || getComputedStyle(wrapper).display === "none";
      },
    },
    next: {
      label: "下一节课程",
      detect: () => {
        const mask = document.querySelector(".ended-mask");
        const nextBtn = document.querySelector(".ended-mask .btns .next");

        if (mask && getComputedStyle(mask).display !== "none" && nextBtn) {
          return nextBtn;
        }

        return null;
      },
      act: (el) => simulateClick(el),
      success: () => {
        const mask = document.querySelector(".ended-mask");
        return !mask || getComputedStyle(mask).display === "none";
      },
    },
    play: {
      label: "视频播放",
      detect: () =>
        document.querySelector(".vcp-controls-panel.show .vcp-playtoggle"),
      act: (el) => simulateClick(el),
      success: () => !document.querySelector(".vcp-controls-panel.show"),
    },
    pause: {
      label: "暂停状态播放",
      detect: () =>
        isBigPlayPaused() ? document.querySelector(".vcp-playtoggle") : null,
      act: (el) => simulateClick(el),
      success: () => !isBigPlayPaused(),
    },
  };

  function isBigPlayPaused() {
    const el = document.querySelector(".vcp-bigplay");
    if (!el) return false;

    const afterStyle = window.getComputedStyle(el, "::after");
    const display = afterStyle.getPropertyValue("display");
    const content = afterStyle.getPropertyValue("content");
    const opacity = parseFloat(afterStyle.getPropertyValue("opacity"));

    return (
      display !== "none" &&
      content &&
      content !== "none" &&
      content !== '""' &&
      opacity > 0
    );
  }

  function checkAndHandleOperations() {
    if (!userInteracted) {
      console.log("[保活助手] 尚未检测到用户交互，跳过本次检测");
      return;
    }

    for (const key of Object.keys(operations)) {
      if (currentOperation) return; // 正在执行操作

      const op = operations[key];
      const element = op.detect();
      if (element) {
        console.log(`[保活助手] 发现 ${op.label}，开始处理`);
        currentOperation = key;
        startRetryOperation(key);
        return;
      }
    }

    console.log(`[保活助手] 未发现任何可执行操作`);
  }

  function startRetryOperation(operationKey) {
    retryCount = 0;
    const op = operations[operationKey];

    const attempt = () => {
      if (retryCount >= MAX_RETRY_COUNT) {
        console.warn(
          `[保活助手 ${new Date().toLocaleTimeString()}] ${op.label}已达最大重试次数，放弃`,
        );
        cleanup();
        return;
      }

      try {
        retryCount++;
        const el = op.detect();
        console.log(
          `[保活助手 ${new Date().toLocaleTimeString()}] 第${retryCount}次尝试${op.label}`,
        );

        if (!el || op.success()) {
          console.log(
            `[保活助手 ${new Date().toLocaleTimeString()}] ${op.label}成功或已消失`,
          );
          cleanup();
          return;
        }

        op.act(el);
        setTimeout(attempt, 2000);
      } catch (e) {
        console.error(
          `[保活助手 ${new Date().toLocaleTimeString()}] ${op.label}出错：`,
          e,
        );
        cleanup();
      }
    };

    function cleanup() {
      currentOperation = null;
      retryCount = 0;
    }

    attempt(); // 第一次尝试
  }

  function onUserInteract() {
    if (userInteracted) return;
    userInteracted = true;
    console.log("[保活助手] 首次用户交互已检测，启动保活检测");
    checkAndHandleOperations();
    setInterval(checkAndHandleOperations, CHECK_INTERVAL);

    window.removeEventListener("click", onUserInteract);
    window.removeEventListener("keydown", onUserInteract);
  }

  window.addEventListener("click", onUserInteract);
  window.addEventListener("keydown", onUserInteract);

  if (document.hasFocus()) {
    userInteracted = true;
    console.log("[保活助手] 页面已激活，假设用户已交互");
    checkAndHandleOperations();
    setInterval(checkAndHandleOperations, CHECK_INTERVAL);
    window.removeEventListener("click", onUserInteract);
    window.removeEventListener("keydown", onUserInteract);
  }
})();
