#!/usr/bin/env ruby
# frozen_string_literal: true

# Regenerates JovieMac.xcodeproj, the Swift-native Mac spike
# (docs/macos/ADR-swift-native-mac.md). It compiles shared iOS sources by
# reference so Jovie.xcodeproj stays untouched. Add a shared file to
# SHARED_SOURCES, rerun, and commit the regenerated project.
#
#   ruby apps/ios/scripts/generate-mac-project.rb

require 'fileutils'
require 'xcodeproj'

IOS_DIR = File.expand_path('..', __dir__)
PROJECT_PATH = File.join(IOS_DIR, 'JovieMac.xcodeproj')

SHARED_SOURCES = %w[
  Jovie/DesignSystem/JovieTheme.swift
  Jovie/Core/APIClient.swift
  Jovie/Core/MobileMeResponse.swift
  Jovie/Core/MobileAudienceHighlightsResponse.swift
  Jovie/Core/MobileActionLoopInboxResponse.swift
  Jovie/Core/MobileActionLoopCalendarResponse.swift
  Jovie/Core/NativeSessionTokenStore.swift
  Jovie/App/MobileAuthReturn.swift
  Jovie/App/AppRouter.swift
].freeze

MAC_SOURCES = %w[
  JovieMac/JovieMacApp.swift
  JovieMac/MacPasskeySignIn.swift
  JovieMac/MacSessionModel.swift
].freeze

MAC_RESOURCES = %w[
  Jovie/Resources/Fonts/Inter-Variable.ttf
  Jovie/Resources/Assets.xcassets
].freeze

TEST_SOURCES = %w[JovieMacTests/MacPasskeySignInTests.swift].freeze

DEPLOYMENT_TARGET = '14.0'

COMMON_SETTINGS = {
  'CODE_SIGNING_ALLOWED' => 'NO',
  'CODE_SIGNING_REQUIRED' => 'NO',
  'CODE_SIGN_STYLE' => 'Automatic',
  'DEVELOPMENT_TEAM' => '',
  'MACOSX_DEPLOYMENT_TARGET' => DEPLOYMENT_TARGET,
  'SWIFT_VERSION' => '5.0',
  'ENABLE_USER_SCRIPT_SANDBOXING' => 'NO',
  'SWIFT_EMIT_LOC_STRINGS' => 'NO'
}.freeze

def add_files(project, target, paths, phase)
  paths.each do |path|
    group = project.main_group.find_subpath(File.dirname(path), true)
    group.set_source_tree('<group>')
    ref = group.find_file_by_path(File.basename(path)) ||
          group.new_reference(File.basename(path))
    target.public_send(phase).add_file_reference(ref)
  end
end

def fix_group_paths(group)
  group.groups.each do |child|
    child.path = child.name if child.path.nil?
    child.name = nil if child.name == child.path
    fix_group_paths(child)
  end
end

FileUtils.rm_rf(PROJECT_PATH)
project = Xcodeproj::Project.new(PROJECT_PATH)
# Swift-only project: replace the gem's Objective-C/Clang template settings
# with the few that matter, shared by every target.
project.build_configurations.each do |config|
  debug = config.name == 'Debug'
  config.build_settings = COMMON_SETTINGS.merge(
    'SDKROOT' => 'macosx',
    'ENABLE_TESTABILITY' => debug ? 'YES' : 'NO',
    'ONLY_ACTIVE_ARCH' => debug ? 'YES' : 'NO',
    'SWIFT_OPTIMIZATION_LEVEL' => debug ? '-Onone' : '-O',
    'SWIFT_ACTIVE_COMPILATION_CONDITIONS' => debug ? 'DEBUG' : '',
    'DEBUG_INFORMATION_FORMAT' => debug ? 'dwarf' : 'dwarf-with-dsym'
  )
end

app = project.new_target(:application, 'JovieMac', :osx, DEPLOYMENT_TARGET)
add_files(project, app, SHARED_SOURCES + MAC_SOURCES, :source_build_phase)
add_files(project, app, MAC_RESOURCES, :resources_build_phase)
app.frameworks_build_phase.files.each(&:remove_from_project)
app.build_configurations.each do |config|
  config.build_settings = {}
  config.build_settings.merge!(
    'PRODUCT_NAME' => 'JovieMac',
    'PRODUCT_MODULE_NAME' => 'JovieMac',
    'PRODUCT_BUNDLE_IDENTIFIER' => 'ie.jov.Jovie',
    'INFOPLIST_FILE' => 'JovieMac/Info.plist',
    'CODE_SIGN_ENTITLEMENTS' => 'JovieMac/JovieMac.entitlements',
    'ENABLE_HARDENED_RUNTIME' => 'YES',
    'MARKETING_VERSION' => '0.1',
    'CURRENT_PROJECT_VERSION' => '1',
    'LD_RUNPATH_SEARCH_PATHS' => '$(inherited) @executable_path/../Frameworks'
  )
end

tests = project.new_target(:unit_test_bundle, 'JovieMacTests', :osx, DEPLOYMENT_TARGET)
add_files(project, tests, TEST_SOURCES, :source_build_phase)
tests.add_dependency(app)
tests.frameworks_build_phase.files.each(&:remove_from_project)
tests.build_configurations.each do |config|
  config.build_settings = {}
  config.build_settings.merge!(
    'PRODUCT_NAME' => 'JovieMacTests',
    'PRODUCT_BUNDLE_IDENTIFIER' => 'ie.jov.JovieMacTests',
    'GENERATE_INFOPLIST_FILE' => 'YES',
    'TEST_HOST' => '$(BUILT_PRODUCTS_DIR)/JovieMac.app/Contents/MacOS/JovieMac',
    'BUNDLE_LOADER' => '$(TEST_HOST)'
  )
end

# The template links Cocoa.framework; SwiftUI imports its own frameworks.
project.frameworks_group.children.dup.each(&:remove_from_project)

%w[Jovie JovieMac JovieMacTests].each do |name|
  group = project.main_group[name]
  group.path = name
  group.name = nil
  fix_group_paths(group)
end
project.predictabilize_uuids
project.save

scheme = Xcodeproj::XCScheme.new
scheme.configure_with_targets(app, tests)
scheme.save_as(PROJECT_PATH, 'JovieMac', true)

# predictabilize_uuids emits 32-hex MD5 IDs, which secret scanners read as API
# tokens. Shorten them (project and scheme alike) to Xcode's native 24-hex width.
Dir.glob(File.join(PROJECT_PATH, '**', '*.{pbxproj,xcscheme}')).each do |path|
  File.write(path, File.read(path).gsub(/\b([0-9A-F]{24})[0-9A-F]{8}\b/, '\\1'))
end
