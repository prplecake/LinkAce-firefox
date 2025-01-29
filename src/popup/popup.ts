import {isBlockquote, maxDescLen, StorageKeys} from "../common";
import $ from "jquery";
import "./popup.scss";
import {Logger} from "../lib/logger";
import KeyDownEvent = JQuery.KeyDownEvent;

const logger = new Logger("popup");

const bg: Window = browser.extension.getBackgroundPage()!,
  keyCode = {
    enter: 13,
    tab: 9,
    up: 38,
    down: 40,
    ctrl: 17,
    n: 78,
    p: 80,
    space: 32
  },
  SEC = 1000, MIN = SEC * 60, HOUR = MIN * 60, DAY = HOUR * 24,
  WEEK = DAY * 7;

const escapeHTML = function (str: string) {
  const replacements: { [key: string]: string } = {
    "&": "&amp;",
    "\"": "&quot;",
    "'": "&#39;",
    "<": "&lt;",
    ">": "&gt;"
  };
  return str.replace(/[&"'<>]/g, (m) => replacements[m]);
};

const getTimePassed = function (date: Date) {
  const ret = {
      week: 0,
      day: 0,
      hour: 0,
      min: 0,
      sec: 0,
      offset: -1
    },
    offset = new Date().getTime() - date.getTime();
  let r;
  if (offset <= 0) return ret;
  ret.offset = offset;
  ret.week = Math.floor(offset / WEEK);
  r = offset % WEEK;
  ret.day = Math.floor(offset / DAY);
  r = offset % DAY;
  ret.hour = Math.floor(r / HOUR);
  r = r % HOUR;
  ret.min = Math.floor(r / MIN);
  r = r % MIN;
  ret.sec = Math.floor(r / SEC);
  return ret;
};

const renderSavedTime = function (time: number) {
  const passed = getTimePassed(new Date(time));
  let dispStr = "previously saved ";
  if (passed.offset > WEEK) {
    dispStr = dispStr.concat(String(passed.week), " ", "weeks ago");
  } else if (passed.offset > DAY) {
    dispStr = dispStr.concat(String(passed.day), " ", "days ago");
  } else if (passed.offset > HOUR) {
    dispStr = dispStr.concat(String(passed.hour), " ", "hours ago");
  } else {
    dispStr = dispStr.concat("just now");
  }
  return dispStr;
};

const $scope: Scope = {
  "loadingText": "Loading...",
};
const $loading = $("#state-mask").hide();
const $login = $("#login-window").hide();
const $bookmark = $("#bookmark-window").hide();
const $postform = $("#add-post-form").hide();
const $autocomplete = $("#auto-complete").hide();

(() => {
  $("#logo-link").attr("href", localStorage[StorageKeys.Url]);
})();

const renderLoading = (loadingText?: string) => {
  $scope.loadingText = loadingText || $scope.loadingText;
  if ($scope.isLoading === true) {
    $loading.text($scope.loadingText);
    $loading.show();
  } else {
    $loading.hide();
  }
};
renderLoading();

const renderLoginPage = () => {
  logger.log("rendering login page");
  $login.show();
  if (localStorage[StorageKeys.Url]) {
    $("#linkace_url").val(localStorage[StorageKeys.Url]);
  }

  const $loginerr = $("#login-error");
  if ($scope.isLoginError === true) {
    $loginerr.show();
  } else {
    $loginerr.hide();
  }

  $("#login-btn").off("click").on("click", loginSubmit);
};

browser.runtime.onMessage.addListener(function(message){
  // logger.log("receive message: " + JSON.stringify(message))
  if (message.type === "login-succeed") {
    $scope.isLoading = false;
    $scope.isLoginError = false;

    renderUserInfo();
    $loading.hide();
    renderBookmarkPage();
  } else if (message.type === "login-failed") {
    $scope.isLoading = false;
    $scope.isLoginError = true;

    $loading.hide();
    renderLoginPage();
  } else if (message.type === "logged-out") {
    $scope.isAnony = true;
    $scope.isLoading = false;
    $scope.isLoginError = false;

    $bookmark.hide();
    $loading.hide();
    renderLoginPage();
  } else if (message.type === "render-suggests") {
    $scope.suggests = message.data;
    renderSuggest();
  } else if (message.type === "render-page-info") {
    if (message.data) {
      browser.tabs.query({ active: true, currentWindow: true })
        .then((tabs) => {
          const tab = tabs[0];
          let pageInfo = message.data;
          if (pageInfo.isSaved == false) {
            pageInfo = {
              url: tab.url,
              title: tab.title,
              tag: "",
              desc: ""
            };
            pageInfo.shared = (localStorage[StorageKeys.AllPrivate] !== "true");
            pageInfo.toread = (localStorage[StorageKeys.AllReadLater] === "true");
            pageInfo.isSaved = false;
          }
          if (pageInfo.tag) {
            pageInfo.tag = pageInfo.tag.concat(" ");
          }
          pageInfo.isPrivate = !pageInfo.shared;
          $scope.pageInfo = $.extend({}, pageInfo);
          initAutoComplete();

          $("#url").val(pageInfo.url);
          $("#title").val(pageInfo.title);
          $("#tag").val(pageInfo.tag);
          if (!pageInfo.desc) {
            chrome.tabs.sendMessage(
              tab.id as number, {
                method: "getDescription"
              },
              function (response: any) {
                if (typeof response !== "undefined" &&
                  response.data.length !== 0) {
                  let desc = response.data;
                  if (desc.length > maxDescLen) {
                    desc = desc.slice(0, maxDescLen) + "...";
                  }
                  if (isBlockquote()) {
                    desc = "<blockquote>" + desc + "</blockquote>";
                  }
                  pageInfo.desc = desc;
                  $("#desc").val(pageInfo.desc);
                }
              }
            );
          } else {
            $("#desc").val(pageInfo.desc);
          }

          if (pageInfo.isPrivate === true) {
            $("#private").prop("checked", true);
          }
          if (pageInfo.toread === true) {
            $("#toread").prop("checked", true);
          }

          renderError();

          const $savetime = $(".alert-savetime").hide();
          if (pageInfo.time) {
            $savetime.text(renderSavedTime(pageInfo.time));
            $savetime.show();
          } else {
            $savetime.hide();
          }

          if (pageInfo.isSaved === true) {
            $("#opt-delete").off("click").on("click", function(){
              $("#opt-cancel-delete").off("click").on("click", function(){
                $("#opt-confirm").hide();
                $("#opt-delete").show();
                return false;
              });

              $("#opt-destroy").off("click").on("click", function(){
                postDelete();
                return false;
              });

              $("#opt-delete").hide();
              $("#opt-confirm").show();
              return false;
            }).show();
          }

          $("#tag").off("change keyup paste").on("change keyup paste", function (e) {
            const code = e.charCode ? e.charCode : e.keyCode;
            if (code && $.inArray(code, [keyCode.enter, keyCode.tab, keyCode.up, keyCode.down,
              keyCode.n, keyCode.p, keyCode.ctrl, keyCode.space]) === -1) {
              $scope.pageInfo && ($scope.pageInfo.tags = $("#tag").val()?.toString().split(" "));
              renderSuggest();
              showAutoComplete();
            }
          }).off("keydown").on("keydown", function (e) {
            chooseTag(e);
            renderSuggest();
          });

          $postform.off("submit").on("submit", function(){
            postSubmit();
            return false;
          });

          $scope.isLoading = false;
          renderLoading();

          $postform.show();

          $("#tag").focus();
        });
    } else {
      logger.log("query bookmark info error");
      $scope.loadingText = "Query bookmark info error";
      $scope.isLoading = true;
      renderLoading();
    }
  } else if (message.type === "addpost-succeed") {
    $scope.isPostError = false;
    window.close();
  } else if (message.type === "addpost-failed") {
    $scope.isLoading = false;
    $scope.isPostError = true;
    $scope.postErrorText = message.error;
    renderError();
    renderLoading();
  } else if (message.type === "deletepost-succeed") {
    $scope.isPostError = false;
    window.close();
  } else if (message.type === "deletepost-failed") {
    $scope.isLoading = false;
    $scope.isPostError = true;
    $scope.postErrorText = message.error;
    renderError();
    renderLoading();
  }
});

const loginSubmit = () => {
  const authToken = $("#token").val() as string;
  const url = $("#linkace_url").val() as string;
  if (authToken) {
    $scope.loadingText = "log in...";
    $scope.isLoading = true;
    $login.hide();
    renderLoading();
    bg.login({url, token: authToken});
    return false;
  }
};

const renderPageHeader = () => {
  $("#username").text($scope.userInfo?.name as string);

  $(".logout a").on("click", function () {
    logger.log("log out...");
    $scope.isLoading = true;
    $scope.loadingText = "Log out...";
    renderLoading();
    bg.logout();
  });
};

const renderError = () => {
  const $posterr = $(".alert-error").hide();
  if ($scope.isPostError === true) {
    $posterr.text($scope.postErrorText as string);
    $posterr.show();
    $postform.show();
  } else {
    $posterr.hide();
  }
};

const renderBookmarkPage = () => {
  logger.log("rendering bookmark page");
  $bookmark.show();
  renderPageHeader();
  browser.tabs.query({ active: true, currentWindow: true })
    .then(tabs => {
    const tab = tabs[0];
    if (tab.url && tab.url.indexOf("http://") !== 0 && tab.url.indexOf("https://") !== 0 && tab.url.indexOf("ftp://") !== 0) {
      logger.log("invalid tab");
      $scope.loadingText = "Please select a valid tab";
      $scope.isLoading = true;
      renderLoading();
      return;
    }

    $scope.loadingText = "Loading bookmark...";
    $scope.isLoading = true;
    renderLoading();

    bg.getPageInfo(tab.url as string);
  });
};

const initAutoComplete = () => {
  const tags = bg.getTags();
  if (tags && tags.length) {
    $scope.allTags = tags;
  } else {
    $scope.allTags = [];
  }
};

const chooseTag = function (e: KeyDownEvent) {
  const code = e.charCode ? e.charCode : e.keyCode;
  if (code && $.inArray(code, [keyCode.enter, keyCode.tab, keyCode.up, keyCode.down,
    keyCode.n, keyCode.p, keyCode.ctrl, keyCode.space]) !== -1) {
    if (code == keyCode.enter || code == keyCode.tab) {
      if ($scope.isShowAutoComplete) {
        e.preventDefault();
        // submit tag
        const items = $scope.pageInfo?.tags,
          tag = $scope.autoCompleteItems[$scope.activeItemIndex as number];
        items?.splice(items.length - 1, 1, tag.text);
        $scope.pageInfo && ($scope.pageInfo.tags = items);
        $("#tag").val($scope.pageInfo?.tags?.join(" ") + "");
        $scope.isShowAutoComplete = false;
        renderAutoComplete();
      } else if (code == keyCode.enter) {
        postSubmit();
        return false;
      }
    } else if (code == keyCode.down ||
      (code == keyCode.n && e.ctrlKey == true)) {
      // move up one item
      e.preventDefault();
      let idx = ($scope.activeItemIndex as number) + 1;
      if (idx >= $scope.autoCompleteItems.length) {
        idx = 0;
      }
      const newItems = $scope.autoCompleteItems.map((item: any) => {
        return { text: item.text, isActive: false };
      });
      $scope.autoCompleteItems = newItems;
      $scope.activeItemIndex = idx;
      $scope.autoCompleteItems[idx].isActive = true;
      renderAutoComplete();
    } else if (code == keyCode.up ||
      (code == keyCode.p && e.ctrlKey == true)) {
      // move down one item
      e.preventDefault();
      let idx = ($scope.activeItemIndex as number) - 1;
      if (idx < 0) {
        idx = $scope.autoCompleteItems.length - 1;
      }
      const newItems = $scope.autoCompleteItems.map((item: any) => {
        return { text: item.text, isActive: false };
      });
      $scope.autoCompleteItems = newItems;
      $scope.activeItemIndex = idx;
      $scope.autoCompleteItems[idx].isActive = true;
      renderAutoComplete();
    } else if (code == keyCode.space) {
      $scope.isShowAutoComplete = false;
      renderAutoComplete();
    }
  }
};

const showAutoComplete = () => {
  const items = $scope.pageInfo?.tags as string[];
  let word = items[items.length - 1];
  const MAX_SHOWN_ITEMS = 5;
  if (word) {
    logger.log(word);
    word = word.toLowerCase();
    const allTags = $scope.allTags;
    let shownCount = 0;
    const autoCompleteItems = [];
    let i = 0;
    const len = allTags?.length as number;
    for (; i < len && shownCount < MAX_SHOWN_ITEMS; i++) {
      const tag = allTags![i];
      if (tag.indexOf(word) !== -1 && $.inArray(tag, items) === -1) {
        const item = {
          text: tag,
          isActive: false
        };
        autoCompleteItems.push(item);
        shownCount += 1;
      }
    }
    if (shownCount) {
      $scope.autoCompleteItems = autoCompleteItems.reverse();
      $scope.autoCompleteItems[0].isActive = true;
      $scope.activeItemIndex = 0;
      $scope.isShowAutoComplete = true;
      const tagEl = $("#tag"),
        pos = $("#tag").offset();
      if (pos) {
        pos.top = pos.top + tagEl.outerHeight()!;
        $autocomplete.css({
          "left": pos.left,
          "top": pos.top
        });
      }
    } else {
      $scope.isShowAutoComplete = false;
    }
  } else {
    $scope.isShowAutoComplete = false;
  }
  renderAutoComplete();
};

const renderAutoComplete = () => {
  if ($scope.isShowAutoComplete === true) {
    $("#auto-complete ul").html("");
    $.each($scope.autoCompleteItems, function (index, item) {
      let cls = "";
      if (item.isActive === true) {
        cls = "active";
      }
      $("#auto-complete ul").append("<li class=\"" + cls + "\">" + escapeHTML(item.text) + "</li>");
    });
    $autocomplete.show();
  } else {
    $autocomplete.hide();
  }
};

const renderSuggest = () => {
  if ($scope.suggests && $scope.suggests.length > 0) {
    $("#suggest").html("");
    $.each($scope.suggests, function (index, suggest) {
      let cls = "add-tag";
      if ($scope.pageInfo?.tags?.toString().split(",").indexOf(suggest) != -1) {
        cls += " selected";
      }
      $("#suggest").append("<a href=\"#\" class=\"" + cls + "\">" + escapeHTML(suggest) + "</a>");
    });
    $("#suggest").append("<a href=\"#\" class=\"add-all-tag\">Add all</a>");
    $(".add-tag").off("click").on("click", function(){
      const tag = $(this).text();
      addTags([tag]);
      $(this).addClass("selected");
    });
    $(".add-all-tag").off("click").on("click", function(){
      addTags($scope.suggests);
    });
    $("#suggest-list").show();
  } else {
    $("#suggest-list").hide();
  }
};

const addTag = (s: string) => {
  const t = $scope.pageInfo?.tags?.join(" ");
  // skip if tag already added
  if (t && $.inArray(s, t.split(" ")) === -1) {
    $scope.pageInfo && ($scope.pageInfo.tags = (t + " " + s + " ").split(" "));
  }
  $("#tag").val($scope.pageInfo?.tags?.join(" ") as string);
};

const addTags = (tags: string[]) => {
  $.each(tags, function (index, tag) {
    addTag(tag);
  });
};

const postSubmit = () => {
  logger.log("post new bookmark");
  $scope.isLoading = true;
  $scope.loadingText = "Saving...";
  $postform.hide();
  $scope.isPostError = false;
  renderError();
  renderLoading();

  const info: PageInfo = {
    url: $("#url").val() as string,
    title: $("#title").val() as string,
    description: $("#desc").val() as string,
    tags: $("#tag").val()?.toString().split(" "),
  };

  info.isPrivate = $("#private").prop("checked");
  bg.addPost(info);
};

const postDelete = () => {
  logger.log("delete bookmark");
  $scope.isLoading = true;
  $scope.loadingText = "Deleting...";
  $postform.hide();
  $scope.isPostError = false;
  renderError();
  renderLoading();
  browser.tabs.query({ active: true, currentWindow: true })
    .then(tabs => {
      const tab = tabs[0];
      bg.deletePost(tab.url as string);
  });
};

$("#linkace_url").on("keyup", () => {
  const val = $("#linkace_url").val();
  logger.log(val);
  $("#linkace_settings_url").attr("href", `${val}/settings`);
  localStorage[StorageKeys.Url] = val;
});

$(".link").on("click", function() {
  const url = $(this).attr("href");
  browser.tabs.query({})
    .then(tabs => {
      const index = tabs.length;
      browser.tabs.create({
        url: url,
        index: index
      });
      window.close();
    });
  return false;
});

$(".option").off("click").on("click", function () {
  browser.runtime.openOptionsPage();
});

const renderUserInfo = () => {
  const userInfo = bg.getUserInfo();
  $scope.userInfo = userInfo;
  $scope.isAnony = !userInfo || !userInfo.isChecked;
};

renderUserInfo();
$scope.isLoading = false;
if ($scope.isAnony) {
  renderLoading();
  renderLoginPage();
} else {
  renderBookmarkPage();
}