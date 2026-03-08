package com.admin.config;

import com.admin.common.interceptor.JwtInterceptor;
import com.admin.service.IamAuthService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;


@Configuration
@EnableWebMvc
public class WebMvcConfig implements WebMvcConfigurer {

    private final IamAuthService iamAuthService;

    public WebMvcConfig(IamAuthService iamAuthService) {
        this.iamAuthService = iamAuthService;
    }

    private CorsConfiguration buildConfig() {
        CorsConfiguration corsConfiguration = new CorsConfiguration();
        corsConfiguration.addAllowedOrigin("*");
        corsConfiguration.addAllowedHeader("*");
        corsConfiguration.addAllowedMethod("*");
        corsConfiguration.addExposedHeader("Authorization");
        return corsConfiguration;
    }

    @Bean
    public CorsFilter corsFilter() {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", buildConfig());
        return new CorsFilter(source);
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOrigins("*")
                .allowedMethods("GET", "POST", "DELETE", "PUT")
                .maxAge(3600);
    }

    /**
     * JWT拦截器
     */
    @Bean
    public JwtInterceptor jwtInterceptor(IamAuthService iamAuthService) {
        return new JwtInterceptor(iamAuthService);
    }

    /**
     * 添加JWT拦截器
     */
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // 添加JWT拦截器，不拦截登录接口
        registry.addInterceptor(jwtInterceptor(iamAuthService))
                .addPathPatterns("/api/**")
                .excludePathPatterns("/flow/**")
                .excludePathPatterns("/api/v1/open_api/**")
                .excludePathPatterns("/api/v1/config/get")
                .excludePathPatterns("/api/v1/xui/traffic/**")
                .excludePathPatterns("/api/v1/user/login")
                .excludePathPatterns("/api/v1/user/login/2fa")
                .excludePathPatterns("/api/v1/iam/auth/options")
                .excludePathPatterns("/api/v1/iam/auth/dingtalk/authorize-url")
                .excludePathPatterns("/api/v1/iam/auth/dingtalk/login")
                .excludePathPatterns("/api/v1/captcha/**");
    }
}
