<div class="space-y-4">
    {{-- 评分统计 --}}
    @if($ratingStats['count'] > 0)
        <div class="bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
            <div class="flex items-center gap-6">
                <div class="text-center">
                    <div class="text-3xl font-bold text-gray-900 dark:text-white">{{ $ratingStats['average'] }}</div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">综合评分</div>
                </div>
                <div class="flex-1 space-y-2">
                    <div class="flex items-center gap-2">
                        <span class="text-sm text-gray-600 dark:text-gray-400 w-16">诚信度</span>
                        <div class="flex-1 bg-gray-200 dark:bg-zinc-700 rounded-full h-2">
                            <div class="bg-yellow-400 h-2 rounded-full" style="width: {{ ($ratingStats['integrity'] / 5) * 100 }}%"></div>
                        </div>
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300 w-8">{{ $ratingStats['integrity'] }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-sm text-gray-600 dark:text-gray-400 w-16">责任心</span>
                        <div class="flex-1 bg-gray-200 dark:bg-zinc-700 rounded-full h-2">
                            <div class="bg-yellow-400 h-2 rounded-full" style="width: {{ ($ratingStats['responsibility'] / 5) * 100 }}%"></div>
                        </div>
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300 w-8">{{ $ratingStats['responsibility'] }}</span>
                    </div>
                </div>
                <div class="text-center">
                    <div class="text-xl font-bold text-gray-900 dark:text-white">{{ $ratingStats['count'] }}</div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">条评价</div>
                </div>
            </div>
        </div>
    @endif

    {{-- 评价列表 --}}
    <div class="space-y-3">
        @forelse($reviews as $review)
            <div class="bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
                <div class="flex items-start justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                            <span class="text-indigo-600 dark:text-indigo-400 font-medium">
                                {{ substr($review->reviewer->name ?? '匿', 0, 1) }}
                            </span>
                        </div>
                        <div>
                            <div class="font-medium text-gray-900 dark:text-white">
                                {{ $review->reviewer->name ?? '匿名用户' }}
                            </div>
                            <div class="text-xs text-gray-500 dark:text-gray-400">
                                {{ $review->created_at->format('Y-m-d') }}
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-1">
                        <svg class="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                        </svg>
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {{ $review->average_rating }}
                        </span>
                    </div>
                </div>
                
                @if($review->comment)
                    <p class="mt-3 text-gray-700 dark:text-gray-300 text-sm">
                        {{ $review->comment }}
                    </p>
                @endif
                
                <div class="mt-3 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>诚信度: {{ $review->integrity_rating }}星</span>
                    <span>责任心: {{ $review->responsibility_rating }}星</span>
                </div>
            </div>
        @empty
            <div class="text-center py-8 bg-white dark:bg-zinc-800 rounded-lg shadow">
                <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                </svg>
                <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">暂无评价</h3>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">该用户还没有收到任何评价</p>
            </div>
        @endforelse
    </div>

    @if($totalCount > $limit)
        <div class="text-center">
            <button class="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 text-sm font-medium">
                查看更多评价 ({{ $totalCount - $limit }})
            </button>
        </div>
    @endif
</div>
