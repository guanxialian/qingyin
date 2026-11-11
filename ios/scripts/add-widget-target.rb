#!/usr/bin/env ruby
# 往 Capacitor 生成的 Xcode 工程里加一个 Widget Extension target，
# 用来承载灵动岛 / 锁屏 Live Activity。
#
# 用法（在 ios/App 目录下执行）：
#   ruby ../scripts/add-widget-target.rb
#
# 依赖 CocoaPods 自带的 xcodeproj gem（macOS runner 上一定有）。

require 'xcodeproj'

PROJECT_PATH = 'App.xcodeproj'
APP_TARGET   = 'App'
WIDGET_NAME  = 'QingyinWidgets'
BUNDLE_SUFFIX = '.widgets'

project = Xcodeproj::Project.open(PROJECT_PATH)
app = project.targets.find { |t| t.name == APP_TARGET }
raise "找不到 target #{APP_TARGET}" unless app

# ---------- 1. 建扩展 target ----------
widget = project.targets.find { |t| t.name == WIDGET_NAME }
if widget.nil?
  widget = project.new_target(:app_extension, WIDGET_NAME, :ios, '16.2', nil, :swift)
  puts "已创建 target #{WIDGET_NAME}"
else
  puts "target #{WIDGET_NAME} 已存在，更新配置"
end

app_bundle_id = app.build_configurations.first.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] || 'com.qingyin.app'
widget.build_configurations.each do |config|
  s = config.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = "#{app_bundle_id}#{BUNDLE_SUFFIX}"
  # 必须显式给定，否则 FULL_PRODUCT_NAME 会退化成空串，产出 '.appex'
  s['PRODUCT_NAME'] = WIDGET_NAME
  s['EXECUTABLE_NAME'] = WIDGET_NAME
  s['WRAPPER_EXTENSION'] = 'appex'
  s['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
  s['INFOPLIST_FILE'] = '../QingyinWidgets/Info.plist'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '16.2'
  s['SWIFT_VERSION'] = '5.0'
  s['TARGETED_DEVICE_FAMILY'] = '1,2'
  s['SKIP_INSTALL'] = 'YES'
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['CODE_SIGNING_ALLOWED'] = 'NO'
  s['CODE_SIGNING_REQUIRED'] = 'NO'
  s['LD_RUNPATH_SEARCH_PATHS'] = '$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks'
  s['MARKETING_VERSION'] = app.build_configurations.first.build_settings['MARKETING_VERSION'] || '1.0'
  s['CURRENT_PROJECT_VERSION'] = app.build_configurations.first.build_settings['CURRENT_PROJECT_VERSION'] || '1'
end

# ---------- 2. 文件引用 ----------
def ensure_group(project, name, path)
  group = project.main_group.children.find { |c| c.respond_to?(:display_name) && c.display_name == name }
  group ||= project.main_group.new_group(name, path)
  group
end

def add_sources(group, target, files)
  refs = files.map do |abs|
    base = File.basename(abs)
    existing = group.files.find { |f| f.path && File.basename(f.path) == base }
    existing || group.new_reference(abs)
  end
  target.add_file_references(refs)
  refs
end

widget_sources = Dir.glob(File.expand_path('../QingyinWidgets/*.swift', __dir__)).sort
shared_sources = Dir.glob(File.expand_path('../Shared/*.swift', __dir__)).sort

raise '没找到 Widget 源码' if widget_sources.empty?

widget_group  = ensure_group(project, WIDGET_NAME, '../QingyinWidgets')
shared_group  = ensure_group(project, 'Shared', '../Shared')

widget_sources.each do |f|
  next if widget_group.files.any? { |x| File.basename(x.path.to_s) == File.basename(f) }
  widget_group.new_reference(f)
end

shared_sources.each do |f|
  next if shared_group.files.any? { |x| File.basename(x.path.to_s) == File.basename(f) }
  shared_group.new_reference(f)
end

# Attributes 必须同时编进 App 和扩展
attributes_file = shared_sources.find { |f| f.end_with?('QingyinActivityAttributes.swift') }
raise '缺少 QingyinActivityAttributes.swift' unless attributes_file

# 扩展 target：widget 源码 + Attributes
widget_refs = widget_group.files.select { |f| f.path.to_s.end_with?('.swift') }
shared_ref = shared_group.files.find { |f| f.path.to_s.end_with?('QingyinActivityAttributes.swift') }
unless widget.source_build_phase.files_references.any? { |r| r.path.to_s.end_with?('QingyinWidgetBundle.swift') }
  widget.add_file_references(widget_refs)
end
unless widget.source_build_phase.files_references.any? { |r| r.path.to_s.end_with?('QingyinActivityAttributes.swift') }
  widget.add_file_references([shared_ref])
end

# App target：Attributes + Manager + Capacitor 桥接插件
app_additions = [shared_ref]
shared_group.files.each do |f|
  next if f.path.to_s.end_with?('QingyinActivityAttributes.swift')
  app_additions << f if f.path.to_s.end_with?('LiveActivityManager.swift')
end

# Capacitor 桥接插件必须编进 App，否则 JS 侧 window.Capacitor.Plugins.QingyinLive 不存在
plugin_swift = File.expand_path('App/QingyinLivePlugin.swift', __dir__)
raise "缺少 #{plugin_swift}" unless File.exist?(plugin_swift)
app_group = project.main_group.children.find { |c| c.respond_to?(:display_name) && c.display_name == 'App' }
app_group ||= project.main_group
plugin_ref = project.files.find { |f| File.basename(f.path.to_s) == 'QingyinLivePlugin.swift' }
plugin_ref ||= if app_group.respond_to?(:new_reference)
                 app_group.new_reference(plugin_swift)
               else
                 project.main_group.new_reference(plugin_swift)
               end
app_additions << plugin_ref

app_additions.compact.uniq.each do |ref|
  next if app.source_build_phase.files_references.any? { |r| r.path.to_s == ref.path.to_s }
  app.add_file_references([ref])
end

compiled = app.source_build_phase.files_references.map { |r| File.basename(r.path.to_s) }
puts "App 编译文件: #{compiled.join(', ')}"
raise 'QingyinLivePlugin.swift 没有进入 App target' unless compiled.include?('QingyinLivePlugin.swift')

# ---------- 3. 依赖 + 嵌入 ----------
unless app.dependencies.any? { |d| d.target == widget }
  app.add_dependency(widget)
end

embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' }
embed ||= app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.dst_subfolder_spec = '13' # PlugIns
unless embed.files.any? { |f| f.file_ref == widget.product_reference }
  build_file = embed.add_file_reference(widget.product_reference)
  build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
end

# ---------- 4. App 的 Info.plist 打开 Live Activity ----------
info_plist = app.build_configurations.first.build_settings['INFOPLIST_FILE'] || 'App/Info.plist'
plist_path = File.join(File.dirname(File.expand_path(PROJECT_PATH)), info_plist)
if File.exist?(plist_path)
  require 'rexml/document'
  text = File.read(plist_path)
  unless text.include?('<key>NSSupportsLiveActivities</key>')
    text = text.sub('</dict>', "\t<key>NSSupportsLiveActivities</key>\n\t<true/>\n</dict>")
    File.write(plist_path, text)
    puts "已写入 NSSupportsLiveActivities -> #{plist_path}"
  end
end

project.save
puts "✅ 工程已更新：#{WIDGET_NAME} 扩展已创建并嵌入 #{APP_TARGET}"
