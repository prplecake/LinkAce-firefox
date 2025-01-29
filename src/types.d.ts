interface Window {
  login: (obj: {url: string, token: string}) => void;
  logout: () => void;
  getUserInfo: () => UserInfo;
  getPageInfo: (url: string) => {url: string, isSaved: boolean}|undefined;
  addPost: (info: PageInfo) => void;
  deletePost: (url: string) => void;
  getTags: () => string[];
}

interface UserInfo {
  isChecked: boolean;
  name: string;
  authToken: string;
}

interface PageInfo {
  url?: string;
  title?: string;
  description?: string;
  tags?: string[];
  lists?: string[];
  isPrivate?: boolean;
  checkDisabled?: boolean;
  isSaved?: boolean;
  time?: Date
}

interface Scope {
  loadingText: string;
  userInfo?: UserInfo;
  pageInfo?: PageInfo;
  isLoading?: boolean;
  isLoginError?: boolean;
  isAnony?: boolean;
  isPostError?: boolean;
  postErrorText?: string;
  suggests?: any;
  allTags?: string[];
  isShowAutoComplete?: boolean;
  autoCompleteItems?: any;
  activeItemIndex?: number;
}

interface QueryStateParameters {
  url: string;
  isForce?: boolean;
  callback?: (...args: any[]) => void;
}