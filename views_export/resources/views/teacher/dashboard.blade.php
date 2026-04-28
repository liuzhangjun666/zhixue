@extends('layouts.app')

@section('title', '教师控制台')

@section('content')
<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Header -->
    <header class="bg-white dark:bg-gray-800 shadow-sm">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">教师控制台</h1>
            <div class="flex items-center space-x-4">
                <span class="text-sm text-gray-600 dark:text-gray-400">
                    {{ auth()->user()->nickname }}
                </span>
                <form method="POST" action="{{ route('logout') }}">
                    @csrf
                    <button type="submit" class="text-sm text-red-600 hover:text-red-500">
                        退出登录
                    </button>
                </form>
            </div>
        </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <!-- Stats Cards -->
            <div class="glass-card rounded-2xl p-6">
                <div class="flex items-center">
                    <div class="p-3 rounded-xl bg-indigo-100 dark:bg-indigo-900/30">
                        <flux:icon name="users" class="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600 dark:text-gray-400">匹配家长</p>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white">0</p>
                    </div>
                </div>
            </div>

            <div class="glass-card rounded-2xl p-6">
                <div class="flex items-center">
                    <div class="p-3 rounded-xl bg-green-100 dark:bg-green-900/30">
                        <flux:icon name="star" class="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600 dark:text-gray-400">评分</p>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white">5.0</p>
                    </div>
                </div>
            </div>

            <div class="glass-card rounded-2xl p-6">
                <div class="flex items-center">
                    <div class="p-3 rounded-xl bg-purple-100 dark:bg-purple-900/30">
                        <flux:icon name="eye" class="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600 dark:text-gray-400">资料浏览</p>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white">0</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Quick Actions -->
        <div class="mt-8">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">快捷操作</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <a href="#" class="glass-card rounded-2xl p-6 hover:shadow-lg transition-all duration-200 group">
                    <div class="flex items-center">
                        <div class="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/30 group-hover:bg-blue-200 dark:group-hover:bg-blue-800/30 transition-colors">
                            <flux:icon name="pencil-square" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div class="ml-4">
                            <p class="font-medium text-gray-900 dark:text-white">完善教师资料</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">填写教学经验、擅长科目等信息</p>
                        </div>
                    </div>
                </a>

                <a href="#" class="glass-card rounded-2xl p-6 hover:shadow-lg transition-all duration-200 group">
                    <div class="flex items-center">
                        <div class="p-3 rounded-xl bg-orange-100 dark:bg-orange-900/30 group-hover:bg-orange-200 dark:group-hover:bg-orange-800/30 transition-colors">
                            <flux:icon name="magnifying-glass" class="w-6 h-6 text-orange-600 dark:text-orange-400" />
                        </div>
                        <div class="ml-4">
                            <p class="font-medium text-gray-900 dark:text-white">查看匹配</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">浏览匹配的家长需求</p>
                        </div>
                    </div>
                </a>
            </div>
        </div>
    </main>
</div>
@endsection
