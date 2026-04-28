<div class="space-y-6">
    {{-- 页面标题 --}}
    <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">我的投诉</h2>
        <a href="{{ route('matches') }}" class="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">
            返回匹配列表
        </a>
    </div>

    {{-- 筛选器 --}}
    <div class="bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
        <div class="flex flex-wrap gap-4">
            <div class="flex-1 min-w-[200px]">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">处理状态</label>
                <select wire:model="filterStatus" class="w-full rounded-lg border-gray-300 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white">
                    <option value="">全部状态</option>
                    @foreach($statusOptions as $value => $label)
                        <option value="{{ $value }}">{{ $label }}</option>
                    @endforeach
                </select>
            </div>
            <div class="flex-1 min-w-[200px]">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">投诉类型</label>
                <select wire:model="filterType" class="w-full rounded-lg border-gray-300 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white">
                    <option value="">全部类型</option>
                    @foreach($typeOptions as $value => $label)
                        <option value="{{ $value }}">{{ $label }}</option>
                    @endforeach
                </select>
            </div>
        </div>
    </div>

    {{-- 投诉列表 --}}
    <div class="space-y-4">
        @forelse($complaints as $complaint)
            <div class="bg-white dark:bg-zinc-800 rounded-lg shadow p-6">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        {{-- 头部信息 --}}
                        <div class="flex items-center gap-3 mb-3">
                            <span class="px-3 py-1 rounded-full text-xs font-medium
                                @if($complaint->status === 'pending') bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400
                                @elseif($complaint->status === 'processing') bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400
                                @elseif($complaint->status === 'resolved') bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400
                                @else bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400
                                @endif">
                                {{ $complaint->status_text }}
                            </span>
                            <span class="text-sm text-gray-500 dark:text-gray-400">
                                {{ $complaint->type_text }}
                            </span>
                            <span class="text-sm text-gray-400 dark:text-gray-500">
                                {{ $complaint->created_at->format('Y-m-d H:i') }}
                            </span>
                        </div>

                        {{-- 被投诉人 --}}
                        <div class="mb-3">
                            <span class="text-sm text-gray-600 dark:text-gray-400">被投诉人：</span>
                            <span class="text-sm font-medium text-gray-900 dark:text-white">
                                {{ $complaint->respondent->name ?? '未知用户' }}
                            </span>
                        </div>

                        {{-- 投诉内容 --}}
                        <div class="mb-3">
                            <p class="text-gray-700 dark:text-gray-300">{{ $complaint->content }}</p>
                        </div>

                        {{-- 佐证材料 --}}
                        @if($complaint->evidence && count($complaint->evidence) > 0)
                            <div class="mb-3">
                                <span class="text-sm text-gray-600 dark:text-gray-400 mb-2 block">佐证材料：</span>
                                <div class="flex gap-2">
                                    @foreach($complaint->evidence as $image)
                                        <a href="{{ Storage::url($image) }}" target="_blank" class="block">
                                            <img src="{{ Storage::url($image) }}" class="w-20 h-20 object-cover rounded-lg hover:opacity-80 transition-opacity" alt="证据">
                                        </a>
                                    @endforeach
                                </div>
                            </div>
                        @endif

                        {{-- 处理结果 --}}
                        @if($complaint->status === 'resolved' && $complaint->result)
                            <div class="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                <h4 class="text-sm font-medium text-green-800 dark:text-green-400 mb-1">处理结果</h4>
                                <p class="text-sm text-green-700 dark:text-green-300">{{ $complaint->result }}</p>
                                @if($complaint->handled_at)
                                    <p class="text-xs text-green-600 dark:text-green-500 mt-1">
                                        处理时间：{{ $complaint->handled_at->format('Y-m-d H:i') }}
                                    </p>
                                @endif
                            </div>
                        @endif

                        @if($complaint->status === 'rejected' && $complaint->result)
                            <div class="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                                <h4 class="text-sm font-medium text-red-800 dark:text-red-400 mb-1">驳回原因</h4>
                                <p class="text-sm text-red-700 dark:text-red-300">{{ $complaint->result }}</p>
                            </div>
                        @endif
                    </div>
                </div>
            </div>
        @empty
            <div class="text-center py-12 bg-white dark:bg-zinc-800 rounded-lg shadow">
                <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">暂无投诉记录</h3>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">您还没有提交过任何投诉</p>
            </div>
        @endforelse
    </div>

    {{-- 分页 --}}
    <div class="mt-6">
        {{ $complaints->links() }}
    </div>
</div>
