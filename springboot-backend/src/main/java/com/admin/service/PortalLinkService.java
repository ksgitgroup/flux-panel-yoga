package com.admin.service;

import com.admin.common.dto.PortalLinkSaveDto;
import com.admin.common.lang.R;

public interface PortalLinkService {

    R getPortalLinks();

    R savePortalLinks(PortalLinkSaveDto dto);
}
