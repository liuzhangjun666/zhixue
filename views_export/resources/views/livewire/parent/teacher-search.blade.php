<div class="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
    <!-- Hero Section -->
    <div class="relative overflow-hidden bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500">
        <div class="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZ2LTRoLTJ2NGgyem0tNiA2aC00djJoNHYtMnptMC02di00aC00djRoNHptLTYgNmgtNHYyaDR2LTJ6bTAtNnYtNGgtNHY0aDR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-20"></div>
        <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div class="text-center">
                <h1 class="text-3xl md:text-4xl font-bold text-white mb-4">寻找合适的教师</h1>
                <p class="text-indigo-100 text-lg max-w-2xl mx-auto">根据您的需求筛选，找到最适合的家教老师</p>
            </div>
        </div>
    </div>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <!-- Success Message -->
        @if (session()->has('success'))
            <div class="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl flex items-center gap-3 animate-fade-in">
                <flux:icon name="check-circle" class="w-5 h-5 text-green-500" />
                <span class="text-green-700 dark:text-green-300">{{ session('success') }}</span>
            </div>
        @endif

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <!-- Sidebar Filters -->
            <div class="lg:col-span-1">
                <div class="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6 sticky top-6">
                    <div class="flex items-center justify-between mb-6">
                        <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <flux:icon name="funnel" class="w-5 h-5 text-indigo-500" />
                            筛选条件
                        </h3>
                        <button wire:click="resetFilters" class="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
                            重置
                        </button>
                    </div>

                    <!-- City -->
                    <div class="mb-5">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">城市</label>
                        <select wire:model.live="cityId" class="w-full rounded-xl border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-indigo-500">
                            <option value="">选择城市</option>
                            @foreach($cities as $city)
                                <option value="{{ $city->id }}">{{ $city->name }}</option>
                            @endforeach
                        </select>
                    </div>

                    <!-- District -->
                    @if(count($districts) > 0)
                        <div class="mb-5">
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">区县</label>
                            <select wire:model.live="districtId" class="w-full rounded-xl border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-indigo-500">
                                <option value="">选择区县</option>
                                @foreach($districts as $district)
                                    <option value="{{ $district->id }}">{{ $district->name }}</option>
                                @endforeach
                            </select>
                        </div>
                    @endif

                    <!-- Subject -->
                    <div class="mb-5">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">科目</label>
                        <select wire:model.live="subject" class="w-full rounded-xl border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-indigo-500">
                            <option value="">选择科目</option>
                            @foreach($subjects as $sub)
                                <option value="{{ $sub }}">{{ $sub }}</option>
                            @endforeach
                        </select>
                    </div>

                    <!-- Grade -->
                    <div class="mb-5">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">年级</label>
                        <select wire:model.live="grade" class="w-full rounded-xl border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-indigo-500">
                            <option value="">选择年级</option>
                            @foreach($grades as $g)
                                <option value="{{ $g }}">{{ $g }}</option>
                            @endforeach
                        </select>
                    </div>

                    <!-- Price Range -->
                    <div class="mb-5">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">课时费范围（元/小时）</label>
                        <div class="flex gap-2">
                            <input type="number" wire:model.live="minPrice" placeholder="最低" class="w-1/2 rounded-xl border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-indigo-500">
                            <span class="text-gray-400 self-center">-</span>
                            <input type="number" wire:model.live="maxPrice" placeholder="最高" class="w-1/2 rounded-xl border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-indigo-500">
                        </div>
                    </div>

                    <!-- Teaching Mode -->
                    <div class="mb-5">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">授课方式</label>
                        <select wire:model.live="teachingMode" class="w-full rounded-xl border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-indigo-500">
                            <option value="">不限</option>
                            @foreach($teachingModes as $mode)
                                <option value="{{ $mode }}">{{ $mode }}</option>
                            @endforeach
                        </select>
                    </div>

                    <!-- Experience -->
                    <div class="mb-5">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">最低教龄</label>
                        <select wire:model.live="minExperience" class="w-full rounded-xl border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-indigo-500">
                            <option value="">不限</option>
                            <option value="1">1年以上</option>
                            <option value="3">3年以上</option>
                            <option value="5">5年以上</option>
                            <option value="10">10年以上</option>
                        </select>
                    </div>

                    <!-- Gender -->
                    <div class="mb-5">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">性别</label>
                        <div class="flex gap-4">
                            <label class="flex items-center">
                                <input type="radio" wire:model.live="gender" value="" class="text-indigo-600 focus:ring-indigo-500">
                                <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">不限</span>
                            </label>
                            <label class="flex items-center">
                                <input type="radio" wire:model.live="gender" value="male" class="text-indigo-600 focus:ring-indigo-500">
                                <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">男</span>
                            </label>
                            <label class="flex items-center">
                                <input type="radio" wire:model.live="gender" value="female" class="text-indigo-600 focus:ring-indigo-500">
                                <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">女</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Main Content -->
            <div class="lg:col-span-3">
                <!-- Search Bar & Controls -->
                <div class="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-4 mb-6">
                    <div class="flex flex-col md:flex-row gap-4">
                        <div class="flex-1 relative">
                            <flux:icon name="magnifying-glass" class="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input type="text" wire:model.live.debounce.300ms="keyword" placeholder="搜索教师姓名、教学风格..." class="w-full pl-10 pr-4 py-2.5 rounded-xl border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-indigo-500">
                        </div>
                        <div class="flex gap-3">
                            <select wire:model.live="sortBy" class="rounded-xl border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-indigo-500">
                                <option value="rating">评分最高</option>
                                <option value="experience">经验最丰富</option>
                                <option value="price_asc">价格从低到高</option>
                                <option value="price_desc">价格从高到低</option>
                            </select>
                            <div class="flex bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
                                <button wire:click="$set('viewMode', 'grid')" class="px-3 py-1.5 rounded-lg text-sm font-medium transition-all {{ $viewMode === 'grid' ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-gray-600 dark:text-gray-400' }}">
                                    <flux:icon name="squares-2x2" class="w-4 h-4" />
                                </button>
                                <button wire:click="$set('viewMode', 'list')" class="px-3 py-1.5 rounded-lg text-sm font-medium transition-all {{ $viewMode === 'list' ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-gray-600 dark:text-gray-400' }}">
                                    <flux:icon name="list-bullet" class="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Results Count -->
                <div class="mb-4 text-sm text-gray-600 dark:text-gray-400">
                    找到 <span class="font-semibold text-indigo-600 dark:text-indigo-400">{{ $teachers->total() }}</span> 位教师
                </div>

                <!-- Teachers Grid/List -->
                @if($viewMode === 'grid')
                    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        @foreach($teachers as $teacher)
                            <div class="group bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 overflow-hidden hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 cursor-pointer" wire:click="viewTeacher({{ $teacher->user_id }})">
                                <div class="relative">
                                    <div class="h-32 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                                    <div class="absolute -bottom-10 left-6">
                                        <img src="{{ $teacher->avatar ?? 'https://ui-avatars.com/api/?name='.urlencode($teacher->user->name).'&background=6366f1&color=fff&size=128' }}" alt="{{ $teacher->user->name }}" class="w-20 h-20 rounded-2xl border-4 border-white dark:border-gray-800 shadow-lg object-cover">
                                    </div>
                                    @if($teacher->is_certified)
                                        <div class="absolute top-3 right-3 bg-green-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                                            <flux:icon name="check-badge" class="w-3 h-3" />
                                            认证
                                        </div>
                                    @endif
                                </div>
                                <div class="pt-12 pb-6 px-6">
                                    <div class="flex items-start justify-between mb-2">
                                        <div>
                                            <h3 class="text-lg font-bold text-gray-900 dark:text-white">{{ $teacher->user->name }}</h3>
                                            <p class="text-sm text-gray-500 dark:text-gray-400">{{ $teacher->city?->name }} {{ $teacher->district?->name }}</p>
                                        </div>
                                        <div class="flex items-center gap-1 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-1 rounded-lg">
                                            <flux:icon name="star" class="w-4 h-4 text-yellow-500 fill-yellow-500" />
                                            <span class="text-sm font-semibold text-yellow-700 dark:text-yellow-300">{{ number_format($teacher->rating, 1) }}</span>
                                        </div>
                                    </div>
                                    
                                    <div class="flex flex-wrap gap-2 mb-4">
                                        @foreach(array_slice($teacher->subjects ?? [], 0, 3) as $sub)
                                            <span class="px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 text-xs rounded-lg">{{ $sub }}</span>
                                        @endforeach
                                        @if(count($teacher->subjects ?? []) > 3)
                                            <span class="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded-lg">+{{ count($teacher->subjects) - 3 }}</span>
                                        @endif
                                    </div>

                                    <div class="flex items-center justify-between text-sm mb-4">
                                        <span class="text-gray-600 dark:text-gray-400">
                                            <flux:icon name="briefcase" class="w-4 h-4 inline mr-1" />
                                            {{ $teacher->teaching_experience }}年经验
                                        </span>
                                        <span class="text-gray-600 dark:text-gray-400">
                                            <flux:icon name="currency-yen" class="w-4 h-4 inline mr-1" />
                                            {{ $teacher->min_price }}-{{ $teacher->max_price }}/时
                                        </span>
                                    </div>

                                    <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-4">{{ $teacher->bio }}</p>

                                    <button wire:click.stop="openMatchModal({{ $teacher->user_id }})" class="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-medium rounded-xl transition-all duration-300 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40">
                                        申请匹配
                                    </button>
                                </div>
                            </div>
                        @endforeach
                    </div>
                @else
                    <!-- List View -->
                    <div class="space-y-4">
                        @foreach($teachers as $teacher)
                            <div class="group bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-xl transition-all duration-300 cursor-pointer" wire:click="viewTeacher({{ $teacher->user_id }})">
                                <div class="flex gap-6">
                                    <img src="{{ $teacher->avatar ?? 'https://ui-avatars.com/api/?name='.urlencode($teacher->user->name).'&background=6366f1&color=fff&size=128' }}" alt="{{ $teacher->user->name }}" class="w-24 h-24 rounded-2xl object-cover shadow-lg">
                                    <div class="flex-1">
                                        <div class="flex items-start justify-between mb-2">
                                            <div class="flex items-center gap-3">
                                                <h3 class="text-xl font-bold text-gray-900 dark:text-white">{{ $teacher->user->name }}</h3>
                                                @if($teacher->is_certified)
                                                    <span class="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                                                        <flux:icon name="check-badge" class="w-3 h-3" />
                                                        认证教师
                                                    </span>
                                                @endif
                                                <div class="flex items-center gap-1 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-1 rounded-lg">
                                                    <flux:icon name="star" class="w-4 h-4 text-yellow-500 fill-yellow-500" />
                                                    <span class="text-sm font-semibold text-yellow-700 dark:text-yellow-300">{{ number_format($teacher->rating, 1) }}</span>
                                                </div>
                                            </div>
                                            <button wire:click.stop="openMatchModal({{ $teacher->user_id }})" class="px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-medium rounded-xl transition-all duration-300 shadow-lg shadow-indigo-500/25">
                                                申请匹配
                                            </button>
                                        </div>
                                        <p class="text-gray-600 dark:text-gray-400 mb-3">{{ $teacher->city?->name }} {{ $teacher->district?->name }} · {{ $teacher->teaching_experience }}年教龄 · {{ $teacher->min_price }}-{{ $teacher->max_price }}元/时</p>
                                        <div class="flex flex-wrap gap-2 mb-3">
                                            @foreach($teacher->subjects ?? [] as $sub)
                                                <span class="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 text-sm rounded-lg">{{ $sub }}</span>
                                            @endforeach
                                        </div>
                                        <p class="text-gray-600 dark:text-gray-400 line-clamp-2">{{ $teacher->bio }}</p>
                                    </div>
                                </div>
                            </div>
                        @endforeach
                    </div>
                @endif

                <!-- Pagination -->
                <div class="mt-8">
                    {{ $teachers->links() }}
                </div>
            </div>
        </div>
    </div>

    <!-- Teacher Detail Modal -->
    @if($showTeacherModal && $selectedTeacher)
        <div class="fixed inset-0 z-50 overflow-y-auto" x-data x-init="$el.focus()">
            <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                <div class="fixed inset-0 transition-opacity bg-gray-900/75 backdrop-blur-sm" wire:click="closeTeacherModal"></div>
                <span class="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
                <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-3xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
                    <div class="relative">
                        <div class="h-40 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                        <button wire:click="closeTeacherModal" class="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors">
                            <flux:icon name="x-mark" class="w-5 h-5" />
                        </button>
                        <div class="absolute -bottom-16 left-8">
                            <img src="{{ $selectedTeacher->avatar ?? 'https://ui-avatars.com/api/?name='.urlencode($selectedTeacher->user->name).'&background=6366f1&color=fff&size=128' }}" alt="{{ $selectedTeacher->user->name }}" class="w-32 h-32 rounded-3xl border-4 border-white dark:border-gray-800 shadow-xl object-cover">
                        </div>
                    </div>
                    <div class="pt-20 pb-8 px-8">
                        <div class="flex items-start justify-between mb-4">
                            <div>
                                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">{{ $selectedTeacher->user->name }}</h2>
                                <p class="text-gray-500 dark:text-gray-400">{{ $selectedTeacher->city?->name }} {{ $selectedTeacher->district?->name }}</p>
                            </div>
                            <div class="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2 rounded-xl">
                                <flux:icon name="star" class="w-5 h-5 text-yellow-500 fill-yellow-500" />
                                <span class="text-lg font-bold text-yellow-700 dark:text-yellow-300">{{ number_format($selectedTeacher->rating, 1) }}</span>
                            </div>
                        </div>

                        <div class="grid grid-cols-3 gap-4 mb-6">
                            <div class="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                <p class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{{ $selectedTeacher->teaching_experience }}</p>
                                <p class="text-sm text-gray-600 dark:text-gray-400">年教龄</p>
                            </div>
                            <div class="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                <p class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{{ $selectedTeacher->match_count }}</p>
                                <p class="text-sm text-gray-600 dark:text-gray-400">成功匹配</p>
                            </div>
                            <div class="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                <p class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{{ $selectedTeacher->min_price }}-{{ $selectedTeacher->max_price }}</p>
                                <p class="text-sm text-gray-600 dark:text-gray-400">元/时</p>
                            </div>
                        </div>

                        <div class="space-y-4 mb-6">
                            <div>
                                <h4 class="font-semibold text-gray-900 dark:text-white mb-2">擅长科目</h4>
                                <div class="flex flex-wrap gap-2">
                                    @foreach($selectedTeacher->subjects ?? [] as $sub)
                                        <span class="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-lg">{{ $sub }}</span>
                                    @endforeach
                                </div>
                            </div>
                            <div>
                                <h4 class="font-semibold text-gray-900 dark:text-white mb-2">教授年级</h4>
                                <div class="flex flex-wrap gap-2">
                                    @foreach($selectedTeacher->grades ?? [] as $g)
                                        <span class="px-3 py-1.5 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 rounded-lg">{{ $g }}</span>
                                    @endforeach
                                </div>
                            </div>
                            <div>
                                <h4 class="font-semibold text-gray-900 dark:text-white mb-2">个人简介</h4>
                                <p class="text-gray-600 dark:text-gray-400">{{ $selectedTeacher->bio }}</p>
                            </div>
                            @if($selectedTeacher->teaching_style)
                                <div>
                                    <h4 class="font-semibold text-gray-900 dark:text-white mb-2">教学风格</h4>
                                    <p class="text-gray-600 dark:text-gray-400">{{ $selectedTeacher->teaching_style }}</p>
                                </div>
                            @endif
                        </div>

                        <button wire:click="closeTeacherModal; openMatchModal({{ $selectedTeacher->user_id }})" class="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg shadow-indigo-500/25">
                            申请匹配
                        </button>
                    </div>
                </div>
            </div>
        </div>
    @endif

    <!-- Match Request Modal -->
    @if($showMatchModal)
        <div class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                <div class="fixed inset-0 transition-opacity bg-gray-900/75 backdrop-blur-sm" wire:click="closeMatchModal"></div>
                <span class="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
                <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-3xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                    <div class="p-6">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-xl font-bold text-gray-900 dark:text-white">发送匹配申请</h3>
                            <button wire:click="closeMatchModal" class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                                <flux:icon name="x-mark" class="w-5 h-5 text-gray-500" />
                            </button>
                        </div>
                        <p class="text-gray-600 dark:text-gray-400 mb-4">向教师发送匹配申请，简单介绍您的需求：</p>
                        <textarea wire:model="matchMessage" rows="4" placeholder="例如：您好，我想为孩子找一位数学老师，孩子目前初二，基础较弱..." class="w-full rounded-xl border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-indigo-500 resize-none"></textarea>
                        @error('matchMessage') <p class="mt-2 text-sm text-red-600">{{ $message }}</p> @enderror
                        <div class="flex gap-3 mt-6">
                            <button wire:click="closeMatchModal" class="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                取消
                            </button>
                            <button wire:click="sendMatchRequest" class="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-medium rounded-xl transition-all duration-300 shadow-lg shadow-indigo-500/25">
                                发送申请
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    @endif
</div>
