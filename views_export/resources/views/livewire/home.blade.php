<div class="min-h-screen flex flex-col lg:flex-row">
    <!-- Left Section - Branding -->
    <div class="flex-1 bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 flex items-center justify-center p-8 relative overflow-hidden">
        <!-- Animated Background Circles -->
        <div class="absolute inset-0 overflow-hidden">
            <div class="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 rounded-full transform animate-pulse"></div>
            <div class="absolute -bottom-1/2 -right-1/2 w-3/4 h-3/4 bg-gradient-to-tl from-purple-500/30 to-indigo-500/30 rounded-full transform animate-pulse" style="animation-delay: 1s;"></div>
            <div class="absolute top-1/4 right-1/4 w-1/4 h-1/4 bg-white/10 rounded-full blur-3xl animate-pulse" style="animation-delay: 2s;"></div>
        </div>

        <!-- Content -->
        <div class="relative z-10 text-center lg:text-left max-w-lg">
            <!-- Logo -->
            <div class="flex items-center justify-center lg:justify-start gap-4 mb-8">
                <div class="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-xl">
                    <flux:icon name="academic-cap" class="w-10 h-10 text-white" />
                </div>
                <div>
                    <h1 class="text-3xl font-bold text-white">zhixue.space</h1>
                    <p class="text-indigo-200 text-sm">同城教师家长Flip</p>
                </div>
            </div>

            <!-- Headline -->
            <h2 class="text-4xl lg:text-5xl font-bold text-white leading-tight mb-6">
                找到最合适的<br/>
                <span class="text-yellow-300">学习陪伴者</span>
            </h2>

            <!-- Description -->
            <p class="text-lg text-indigo-100 leading-relaxed mb-8">
                同城精准匹配，让每位家长找到负责任的好老师，<br class="hidden lg:block"/>
                让每位老师遇见需要帮助的学生。
            </p>

            <!-- Features -->
            <div class="grid grid-cols-3 gap-4 text-center">
                <div class="glass-feature">
                    <flux:icon name="map-pin" class="w-6 h-6 mx-auto mb-2 text-yellow-300" />
                    <span class="text-white text-sm">同城匹配</span>
                </div>
                <div class="glass-feature">
                    <flux:icon name="shield-check" class="w-6 h-6 mx-auto mb-2 text-green-300" />
                    <span class="text-white text-sm">实名认证</span>
                </div>
                <div class="glass-feature">
                    <flux:icon name="sparkles" class="w-6 h-6 mx-auto mb-2 text-pink-300" />
                    <span class="text-white text-sm">智能算法</span>
                </div>
            </div>
        </div>
    </div>

    <!-- Right Section - Role Selection -->
    <div class="flex-1 flex items-center justify-center p-8 bg-gray-50 dark:bg-gray-900">
        <div class="w-full max-w-md">
            <!-- Section Title -->
            <div class="text-center mb-10">
                <h3 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    选择您的身份
                </h3>
                <p class="text-gray-600 dark:text-gray-400">
                    开启您的专属服务体验
                </p>
            </div>

            <!-- Role Cards -->
            <div class="space-y-4">
                <!-- Parent Card -->
                <a href="{{ route('register', ['role' => 'parent']) }}" wire:navigate
                   class="block p-6 rounded-2xl glass-card hover:scale-[1.02] transition-all duration-300 group cursor-pointer border-2 border-transparent hover:border-indigo-500">
                    <div class="flex items-center gap-5">
                        <!-- Icon -->
                        <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30 group-hover:shadow-orange-500/50 group-hover:scale-110 transition-all duration-300">
                            <flux:icon name="user-group" class="w-8 h-8 text-white" />
                        </div>

                        <!-- Content -->
                        <div class="flex-1">
                            <h4 class="text-xl font-bold text-gray-900 dark:text-white mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                我是家长
                            </h4>
                            <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                                寻找负责任的好老师，为孩子找到合适的学习陪伴者
                            </p>
                        </div>

                        <!-- Arrow -->
                        <div class="text-gray-400 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all duration-300">
                            <flux:icon name="arrow-right" class="w-6 h-6" />
                        </div>
                    </div>

                    <!-- Tags -->
                    <div class="flex flex-wrap gap-2 mt-4 ml-21">
                        <span class="px-3 py-1 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded-full">
                            作业辅导
                        </span>
                        <span class="px-3 py-1 text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 rounded-full">
                            兴趣培养
                        </span>
                        <span class="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded-full">
                            学科提升
                        </span>
                    </div>
                </a>

                <!-- Teacher Card -->
                <a href="{{ route('register', ['role' => 'teacher']) }}" wire:navigate
                   class="block p-6 rounded-2xl glass-card hover:scale-[1.02] transition-all duration-300 group cursor-pointer border-2 border-transparent hover:border-purple-500">
                    <div class="flex items-center gap-5">
                        <!-- Icon -->
                        <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30 group-hover:shadow-purple-500/50 group-hover:scale-110 transition-all duration-300">
                            <flux:icon name="academic-cap" class="w-8 h-8 text-white" />
                        </div>

                        <!-- Content -->
                        <div class="flex-1">
                            <h4 class="text-xl font-bold text-gray-900 dark:text-white mb-1 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                                我是老师
                            </h4>
                            <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                                展示您的专业能力，找到需要帮助的学生和家长
                            </p>
                        </div>

                        <!-- Arrow -->
                        <div class="text-gray-400 group-hover:text-purple-500 group-hover:translate-x-1 transition-all duration-300">
                            <flux:icon name="arrow-right" class="w-6 h-6" />
                        </div>
                    </div>

                    <!-- Tags -->
                    <div class="flex flex-wrap gap-2 mt-4 ml-21">
                        <span class="px-3 py-1 text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded-full">
                            一对一辅导
                        </span>
                        <span class="px-3 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 rounded-full">
                            小班教学
                        </span>
                        <span class="px-3 py-1 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full">
                            线上授课
                        </span>
                    </div>
                </a>
            </div>

            <!-- Already have account -->
            <div class="mt-8 text-center">
                <p class="text-gray-600 dark:text-gray-400">
                    已有账号？
                    <a href="{{ route('login') }}" wire:navigate class="text-indigo-600 dark:text-indigo-400 font-medium hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors">
                        立即登录
                    </a>
                </p>
            </div>

            <!-- Footer -->
            <div class="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700">
                <p class="text-xs text-center text-gray-500 dark:text-gray-400">
                    登录即表示您同意我们的
                    <a href="#" class="text-indigo-600 hover:text-indigo-500">用户协议</a>
                    和
                    <a href="#" class="text-indigo-600 hover:text-indigo-500">隐私政策</a>
                </p>
            </div>
        </div>
    </div>
</div>

@push('styles')
<style>
    .glass-feature {
        padding: 0.75rem 1rem;
    border-radius: 0.75rem;
    background-color: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(4px);
    }

    .ml-21 {
        margin-left: 5rem;
    }
</style>
@endpush
