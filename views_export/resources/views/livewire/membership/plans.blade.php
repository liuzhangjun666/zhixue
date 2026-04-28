<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    {{-- 头部 --}}
    <div class="bg-white dark:bg-gray-800 px-4 py-4 shadow-sm">
        <div class="flex items-center">
            <button onclick="history.back()" class="mr-4">
                <svg class="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                </svg>
            </button>
            <h1 class="text-lg font-semibold text-gray-900 dark:text-white">会员服务</h1>
        </div>
    </div>

    {{-- 冷启动提示 --}}
    @if($isColdStart)
        <div class="mx-4 mt-4 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl p-4 text-white">
            <div class="flex items-center">
                <svg class="w-8 h-8 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/>
                </svg>
                <div>
                    <p class="font-semibold">🎉 冷启动免费期</p>
                    <p class="text-sm opacity-90">剩余 {{ $membershipStatus['remaining_days'] }} 天免费使用</p>
                </div>
            </div>
        </div>
    @else
        {{-- 会员状态卡片 --}}
        <div class="mx-4 mt-4 bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            @if($membershipStatus['is_member'])
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm text-gray-500 dark:text-gray-400">当前套餐</p>
                        <p class="text-lg font-semibold text-gray-900 dark:text-white">{{ $membershipStatus['plan_name'] }}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm text-gray-500 dark:text-gray-400">剩余天数</p>
                        <p class="text-2xl font-bold text-primary-600">{{ $membershipStatus['remaining_days'] }}<span class="text-sm font-normal">天</span></p>
                    </div>
                </div>
                <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-500 dark:text-gray-400">剩余匹配次数</span>
                        <span class="font-semibold text-gray-900 dark:text-white">{{ $membershipStatus['remaining_matches'] }} 次</span>
                    </div>
                </div>
            @else
                <div class="text-center py-4">
                    <p class="text-gray-500 dark:text-gray-400">您还不是会员</p>
                    <p class="text-sm text-gray-400 dark:text-gray-500 mt-1">购买会员解锁更多匹配机会</p>
                </div>
            @endif
        </div>
    @endif

    {{-- 套餐列表 --}}
    <div class="px-4 mt-6">
        <h2 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
            {{ auth()->user()->role === 'parent' ? '家长会员' : '教师会员' }}
        </h2>
        
        <div class="space-y-4">
            @foreach($plans as $plan)
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border-2 {{ $plan->is_recommended ? 'border-primary-500 relative' : 'border-transparent' }}">
                    {{-- 推荐标签 --}}
                    @if($plan->is_recommended)
                        <div class="absolute -top-3 left-4 bg-primary-500 text-white text-xs px-2 py-1 rounded-full">
                            推荐
                        </div>
                    @endif

                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <h3 class="font-semibold text-gray-900 dark:text-white">{{ $plan->name }}</h3>
                            <p class="text-2xl font-bold text-primary-600 mt-1">
                                ¥{{ number_format($plan->price, 2) }}
                                <span class="text-sm font-normal text-gray-500">/月</span>
                            </p>
                        </div>
                        <div class="text-right">
                            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                {{ $plan->match_quota }} 次匹配
                            </span>
                        </div>
                    </div>

                    {{-- 功能列表 --}}
                    <ul class="space-y-2 mb-4">
                        @foreach($plan->feature_list as $feature)
                            <li class="flex items-center text-sm text-gray-600 dark:text-gray-300">
                                <svg class="w-4 h-4 text-green-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                                </svg>
                                {{ $feature }}
                            </li>
                        @endforeach
                    </ul>

                    {{-- 购买按钮 --}}
                    <button 
                        wire:click="selectPlan({{ $plan->id }})"
                        wire:loading.attr="disabled"
                        class="w-full py-3 rounded-lg font-medium transition-colors {{ $plan->is_recommended ? 'bg-primary-600 text-white hover:bg-primary-700' : 'bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600' }}">
                        <span wire:loading.remove wire:target="selectPlan({{ $plan->id }})">
                            {{ $isColdStart ? '冷启动期免费' : '立即购买' }}
                        </span>
                        <span wire:loading wire:target="selectPlan({{ $plan->id }})">处理中...</span>
                    </button>
                </div>
            @endforeach
        </div>
    </div>

    {{-- 说明 --}}
    <div class="px-4 mt-6 pb-8">
        <div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
            <h3 class="font-medium text-gray-900 dark:text-white mb-2">服务说明</h3>
            <ul class="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <li>• 购买后立即生效，有效期30天</li>
                <li>• 匹配次数用完后可继续购买</li>
                <li>• 支持微信安全支付</li>
                <li>• 个人主体走微信转账，企业走小程序支付</li>
            </ul>
        </div>
    </div>
</div>
