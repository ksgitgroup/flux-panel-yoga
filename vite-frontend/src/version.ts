export const APP_VERSION = __APP_VERSION__;
export const GIT_SHA = __GIT_SHA__;
export const GIT_BRANCH = __GIT_BRANCH__;
export const BUILD_TIME = __BUILD_TIME__;

export const RELEASE_VERSION = `v${APP_VERSION}`;
export const BUILD_REVISION = `${GIT_BRANCH}.${GIT_SHA}`;
export const FULL_VERSION = `${RELEASE_VERSION}+${GIT_SHA}`;
