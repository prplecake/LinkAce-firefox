// {url: {title, desc, tag, time, isSaved, isSaving}}
import {mainPath, maxDescLen, noIcon, REQ_TIME_OUT, savingIcon, StorageKeys, yesIcon} from "./common";
import $ from "jquery";
import {getDefaultHeaders} from "./functions/headers";
import {Logger} from "./lib/logger";
import {getSearchPath} from "./functions/path";
import Tab = browser.tabs.Tab;
import {SnakeCaseReplacer} from "./lib/json";

declare let window: Window;

const logger = new Logger("background");

const pages: { [key: string]: any } = {};
let _userInfo: UserInfo;

const login = (obj: { url: string, token: string} ) => {
  // test auth
  const path = `${obj.url}/api/v1/links`,
    options = {
      method: "GET",
      headers: getDefaultHeaders(undefined, obj.token)
    };
  fetch(path, options)
    .then(response => {
      if (response.ok) {
        logger.log(response);
        // success
        _userInfo.isChecked = true;
        localStorage[StorageKeys.Url] = obj.url;
        localStorage[StorageKeys.AuthToken] = obj.token;
        localStorage[StorageKeys.Checked] = true;

        browser.runtime.sendMessage({
          type: "login-succeed"
        });
        _getTags();
      } else {
        // login error
        browser.runtime.sendMessage({
          type: "login-failed"
        });
      }
    })
    .catch((data) => {
      if (data.statusText == "timeout") {
        browser.runtime.sendMessage({
          type: "login-failed"
        });
      }
    });
};
window.login = login;

const logout = function () {
  _userInfo.isChecked = false;
  localStorage.removeItem(StorageKeys.Checked);
  localStorage.removeItem(StorageKeys.Name);
  localStorage.removeItem(StorageKeys.AuthToken);
  localStorage.removeItem(StorageKeys.NoPing);
  browser.runtime.sendMessage({
    type: "logged-out"
  });
};
window.logout = logout;

const getUserInfo = function (): UserInfo {
  if (!_userInfo) {
    if (localStorage[StorageKeys.Checked]) {
      _userInfo = {
        isChecked: localStorage[StorageKeys.Checked],
        authToken: localStorage[StorageKeys.AuthToken],
        name: localStorage[StorageKeys.Name],
      };
    } else {
      _userInfo = {
        isChecked: false,
        authToken: "",
        name: ""
      };
    }
  }
  return _userInfo;
};
window.getUserInfo = getUserInfo;

// for popup.html to acquire page info
// if there is no page info at local then get it from server
const getPageInfo = function (url: string) {
  if (!url || (url.indexOf("https://") !== 0 && url.indexOf(
    "http://") !== 0)) {
    return {
      url: url,
      isSaved: false
    };
  }
  const pageInfo = pages[url];
  if (pageInfo) {
    browser.runtime.sendMessage({
      type: "render-page-info",
      data: pageInfo
    });
    return;
  }
  // download now
  const cb = function () {
    updateSelectedTabExtIcon();
  };
  queryPinState({url: url, callback: cb});
};
window.getPageInfo = getPageInfo;

let isQuerying = false;
const queryPinState = (params: QueryStateParameters) => {
  const {url, isForce, callback} = params;
  const userInfo = getUserInfo();
  if ((isForce || !isQuerying) && userInfo && userInfo.isChecked &&
    url && (url.indexOf("https://") === 0 || url.indexOf("http://") === 0)) {
    isQuerying = true;
    const options = {
      method: "GET",
      headers: getDefaultHeaders(userInfo)
    };
    fetch(getSearchPath(url), options)
      .then(async response => {
        console.log(response);
        const json = await response.json();
        console.log(json);
        const data = json.data;
        isQuerying = false;
        const posts = data.posts;
        let pageInfo: PageInfo = {isSaved: false};
        if (posts && posts.length) {
          const post = posts[0];
          pageInfo = {
            url: post.href,
            title: post.description,
            description: post.extended,
            tags: post.tags,
            time: post.created_at,
            isPrivate: post.is_private,
            isSaved: true
          };
        }

        browser.runtime.sendMessage({
          type: "render-page-info",
          data: pageInfo
        });
        pages[url] = pageInfo;
        callback && callback(pageInfo);
      })
      .catch((data) => {
        isQuerying = false;
        if (data.statusText == "timeout") {
          delete pages[url];
        }
        browser.runtime.sendMessage({
          type: "render-page-info"
        });
      });
  }
};

const updateSelectedTabExtIcon = () => {
  browser.tabs.query({ active: true, currentWindow: true })
    .then(tabs => {
      const tab = tabs[0];
      const pageInfo = pages[tab.url as string];
      let iconPath = noIcon;
      if (pageInfo && pageInfo.isSaved) {
        iconPath = yesIcon;
      } else if (pageInfo && pageInfo.isSaving) {
        iconPath = savingIcon;
      }
      browser.browserAction.setIcon(
        { path: iconPath, tabId: tab.id });
      browser.pageAction.setIcon(
        { path: iconPath, tabId: tab.id as number });
    });
};


const addPost = function (info: PageInfo) {
  const userInfo = getUserInfo();
  if (userInfo && userInfo.isChecked && info.url && info.title) {
    const path = mainPath + "links",
      data: PageInfo = {
        url: info.url,
        isPrivate: info.isPrivate,
        checkDisabled: info.checkDisabled
      };
    info.title && (data.title = info.title);
    info.description && (data.description = info.description);
    if (info.tags && info.tags.length > 0 && info.tags[0] !== "") {
      data.tags = info.tags;
    }
    const options = {
      method: "POST",
      headers: getDefaultHeaders(userInfo),
      body: JSON.stringify(data, SnakeCaseReplacer)
    };
    fetch(path, options)
      .then(async response => {
      console.log(response);
      const json = await response.json();
      if (response.ok) {
        // done
        pages[info.url as string] = {isSaved: true};
        updateSelectedTabExtIcon();
        queryPinState({
          url: info.url as string,
          isForce: true
        });
        browser.runtime.sendMessage({
          type: "addpost-succeed"
        });
      } else {
        // error
        pages[info.url as string] = {isSaved: false};
        updateSelectedTabExtIcon();
        browser.runtime.sendMessage({
          type: "addpost-failed",
          error: "Add failed: " + json.message
        });
      }
    }).catch((data) => {
      pages[info.url as string] = {isSaved: false};
      updateSelectedTabExtIcon();
      browser.runtime.sendMessage({
        type: "addpost-failed",
        error: "Add failed: " + data.message
      });
    });
    // change icon state
    pages[info.url] = {isSaving: true};
    updateSelectedTabExtIcon();
    // add new tags (if any) to _tags
    const info_tags = info.tags ? info.tags.toString().split(" ").filter(String) : [];
    info_tags.forEach(function (tag: string) {
      if (_tags.indexOf(tag) == -1) {
        _tags.push(tag);
      }
    });
  }
};
window.addPost = addPost;

const deletePost = function (url: string) {
  const userInfo = getUserInfo();
  if (userInfo && userInfo.isChecked && url) {
    const path = mainPath + "posts/delete";
    const settings: any = {
      url: path,
      type: "GET",
      timeout: REQ_TIME_OUT,
      dataType: "json",
      crossDomain: true,
      data: {
        url: url,
        format: "json"
      },
      contentType: "text/plain"
    };
    settings.data.auth_token = userInfo.authToken;
    const jqxhr = $.ajax(settings);
    jqxhr.always(function (data) {
      const resCode = data.result_code;
      if (resCode == "done" || resCode == "item not found") {
        delete pages[url];
        updateSelectedTabExtIcon();
        browser.runtime.sendMessage({
          type: "deletepost-succeed"
        });
      } else {
        browser.runtime.sendMessage({
          type: "deletepost-failed",
          error: "Delete failed: " + data.result_code
        });
      }
    });
    jqxhr.fail(function (data) {
      browser.runtime.sendMessage({
        type: "deletepost-failed",
        error: "Delete failed: " + data.statusText
      });
    });
  }
};
window.deletePost = deletePost;

const arraysEqual = function (_arr1: any[], _arr2: any[]) {
  if (!Array.isArray(_arr1) || !Array.isArray(
    _arr2) || _arr1.length !== _arr2.length) {
    return false;
  }

  const arr1 = _arr1.concat().sort();
  const arr2 = _arr2.concat().sort();

  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) {
      return false;
    }
  }

  return true;
};

const _tags: string[] = [],
  _tagsWithCount = {};
// acquire all user tags from server refresh _tags
const _getTags = () => {
  const userInfo = getUserInfo();
  if (userInfo && userInfo.isChecked && userInfo.authToken) {
    const path = mainPath + "tags",
      settings: JQueryAjaxSettings = {
        url: path,
        type: "GET",
        timeout: REQ_TIME_OUT,
        dataType: "json",
        crossDomain: true,
        headers: getDefaultHeaders(userInfo),
      };
    const jqxhr = $.ajax(settings);
    jqxhr.always(function (data: any) {
      if (data && data.data) {
        const tags = data.data;
        const sortTags = [];
        for (const t in tags) {
          sortTags.push([t, tags[t]]);
        }
        sortTags.sort(function (a, b) {
          return b[1] - a[1];
        });

        for (const i in sortTags) {
          _tags.push(sortTags[i][1]);
        }
      }
    });
  }
};
_getTags();

const getTags = function () {
  return _tags;
};
window.getTags = getTags;

const getTagsWithCount = function () {
  return _tagsWithCount;
};

// query at first time extension loaded
browser.tabs.query({ active: true, currentWindow: true })
  .then(tabs => {
    const tab = tabs[0];
    if (localStorage[StorageKeys.NoPing] === "true") {
      return;
    }
    logger.log("query tab pin state on loaded");
    attemptPageAction(tab);
    queryPinState({
      url: tab.url as string,
      callback: (pageInfo: PageInfo) => {
        if (pageInfo && pageInfo.isSaved) {
          browser.browserAction.setIcon(
            { path: yesIcon, tabId: tab.id });
          browser.pageAction.setIcon(
            { path: yesIcon, tabId: tab.id as number });
        } else {
          browser.browserAction.setIcon({ path: noIcon, tabId: tab.id });
          browser.pageAction.setIcon({ path: noIcon, tabId: tab.id as number });
        }
      }
    });
  });

browser.tabs.onUpdated.addListener(function (id, changeInfo, tab) {
  if (localStorage[StorageKeys.NoPing] === "true") {
    return;
  }
  if (changeInfo.url) {
    const url = changeInfo.url;
    if (!Object.hasOwn(pages, url)) {
      logger.log("query tab pin state on updated");
      browser.browserAction.setIcon({ path: noIcon, tabId: tab.id });
      attemptPageAction(tab);
      queryPinState({
        url: url,
        callback: (pageInfo: PageInfo)=> {
          if (pageInfo && pageInfo.isSaved) {
            browser.browserAction.setIcon(
              { path: yesIcon, tabId: tab.id });
            browser.pageAction.setIcon(
              { path: yesIcon, tabId: tab.id as number });
          } else {
            browser.browserAction.setIcon({ path: noIcon, tabId: tab.id });
            browser.pageAction.setIcon({ path: noIcon, tabId: tab.id as number });
          }
        }
      });
    }
  }
  logger.log("set tab pin state on opening");
  const url: string = (changeInfo.url || tab.url) as string;
  attemptPageAction(tab);
  if (pages[url] && pages[url].isSaved) {
    browser.browserAction.setIcon({ path: yesIcon, tabId: tab.id });
    browser.pageAction.setIcon({ path: yesIcon, tabId: tab.id as number });
  }
});

browser.tabs.onActivated.addListener(function (activeInfo) {
  if (localStorage[StorageKeys.NoPing] === "true") {
    return;
  }
  browser.tabs.query({ active: true, currentWindow: true })
    .then(tabs => {
      const tab = tabs[0];
      const url = tab.url as string;
      if (!Object.hasOwn(pages, url)) {
        logger.log("query tab pin state on actived");
        attemptPageAction(tab);
        queryPinState({
          url: url,
          callback: (pageInfo: PageInfo)=> {
            if (pageInfo && pageInfo.isSaved) {
              browser.browserAction.setIcon(
                { path: yesIcon, tabId: tab.id });
              browser.pageAction.setIcon(
                { path: yesIcon, tabId: tab.id as number });
            } else {
              browser.browserAction.setIcon({ path: noIcon, tabId: tab.id });
              browser.pageAction.setIcon({ path: noIcon, tabId: tab.id as number });
            }
          }
        });
      }
    });
});

/*
Attempt to create a page action on this tab.
Do not show if options checkbox is checked or this is an invalid tab.
*/
function attemptPageAction(tab: Tab) {
  browser.pageAction.hide(tab.id as number);
  if (localStorage[StorageKeys.NoPageAction] !== "true" && tab.url && (tab.url.indexOf("http://") !== -1 || tab.url.indexOf("https://") !== -1)) {
    browser.pageAction.show(tab.id as number);
  }
}
